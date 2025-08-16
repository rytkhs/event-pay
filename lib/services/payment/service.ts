/**
 * PaymentServiceの基本実装
 */

import type { SupabaseClient } from "@supabase/supabase-js";
// import type { PostgrestError } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { stripe, generateIdempotencyKey, createStripeRequestOptions } from "@/lib/stripe/client";
import { retryWithIdempotency } from "@/lib/stripe/idempotency-retry";
import { IPaymentService, IPaymentErrorHandler } from "./interface";
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
  CreateStripeSessionParams,
  CreateStripeSessionResult,
  CreateCashPaymentParams,
  CreateCashPaymentResult,
  UpdatePaymentStatusParams,
  PaymentError,
  PaymentErrorType,
  ErrorHandlingResult,
} from "./types";
import { ERROR_HANDLING_BY_TYPE } from "./error-mapping";
import { logger } from "@/lib/logging/app-logger";

/**
 * PaymentServiceの実装クラス
 */
export class PaymentService implements IPaymentService {
  private supabase: SupabaseClient<Database>;
  private stripe = stripe;
  private errorHandler: IPaymentErrorHandler;

  constructor(supabaseClient: SupabaseClient<Database>, errorHandler: IPaymentErrorHandler) {
    this.supabase = supabaseClient;
    this.errorHandler = errorHandler;
  }

  /**
   * Stripe決済セッションを作成する
   *
   * 重複作成ガードについて:
   * - 重複検知と一意性の最終責務は本メソッド（Service）に集約する。
   * - 振る舞い:
   *   - 参加に紐づく既存決済が支払完了系（paid/received/completed）の場合は
   *     PaymentErrorType.PAYMENT_ALREADY_EXISTS を投げる。
   *   - それ以外（pending/failed など）は再試行として既存レコードを pending に戻し再利用。
   *   - DB一意制約違反（23505）は PAYMENT_ALREADY_EXISTS にマッピング。
   * - Action 層では重複チェックを省略してよい（最終判断は本メソッド）。
   */
  async createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult> {
    try {
      // 既存の決済レコードを確認（attendanceごとに一意）
      const { data: existingList, error: findError } = await this.supabase
        .from("payments")
        .select(
          "id, status, method, stripe_session_id, stripe_payment_intent_id, updated_at, created_at"
        )
        .eq("attendance_id", params.attendanceId)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2);

      if (findError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコードの検索に失敗しました: ${findError.message}`,
          findError
        );
      }

      // 既存の扱い: 支払完了系はブロック、それ以外は再試行として再利用
      let targetPaymentId: string;
      const existingCount = Array.isArray(existingList) ? existingList.length : 0;
      if (existingCount > 1) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          "決済レコードの整合性エラー: 複数のレコードが存在します"
        );
      }

      const existing = existingCount === 1 ? existingList![0] : null;
      if (existing) {
        const status = existing.status as PaymentStatus;
        if (["paid", "received", "completed"].includes(status)) {
          throw new PaymentError(
            PaymentErrorType.PAYMENT_ALREADY_EXISTS,
            "この参加に対する決済は既に完了済みです"
          );
        }

        // 再試行: 既存レコードを pending に戻し、セッションは後段で新規発行して更新
        const { error: reuseError } = await this.supabase
          .from("payments")
          .update({
            amount: params.amount,
            status: "pending",
            // 古いIntentは無効化される前提でクリア（Webhookとの整合は別途担保）
            stripe_payment_intent_id: null,
            // 旧セッションIDは明示的に一旦nullにしてから新規をセット（障害時解析性の向上）
            stripe_session_id: null,
          })
          .eq("id", existing.id);

        if (reuseError) {
          throw new PaymentError(
            PaymentErrorType.DATABASE_ERROR,
            `既存決済の更新に失敗しました: ${reuseError.message}`,
            reuseError
          );
        }
        targetPaymentId = existing.id as string;
      } else {
        // 新規作成
        const { data: payment, error: insertError } = await this.supabase
          .from("payments")
          .insert({
            attendance_id: params.attendanceId,
            method: "stripe",
            amount: params.amount,
            status: "pending",
          })
          .select()
          .single();

        if (insertError) {
          // 一意制約違反（同時実行レース）時は既存を再取得して再利用にフォールバック
          if (insertError.code === "23505") {
            const { data: dupExisting, error: dupFindError } = await this.supabase
              .from("payments")
              .select("id, status")
              .eq("attendance_id", params.attendanceId)
              .single();

            if (dupFindError || !dupExisting) {
              // 既存取得に失敗した場合は保守的に「既に存在」として返す
              throw new PaymentError(
                PaymentErrorType.PAYMENT_ALREADY_EXISTS,
                "この参加記録に対する決済レコードは既に存在します",
                insertError
              );
            }

            const dupStatus = dupExisting.status as PaymentStatus;
            if (["paid", "received", "completed"].includes(dupStatus)) {
              throw new PaymentError(
                PaymentErrorType.PAYMENT_ALREADY_EXISTS,
                "この参加に対する決済は既に完了済みです",
                insertError
              );
            }

            // 未完了なら既存を再利用（pendingへ戻す）
            const { error: dupReuseError } = await this.supabase
              .from("payments")
              .update({
                amount: params.amount,
                status: "pending",
                stripe_payment_intent_id: null,
                stripe_session_id: null,
              })
              .eq("id", dupExisting.id as string);

            if (dupReuseError) {
              throw new PaymentError(
                PaymentErrorType.DATABASE_ERROR,
                `既存決済の更新に失敗しました: ${dupReuseError.message}`,
                dupReuseError
              );
            }

            targetPaymentId = dupExisting.id as string;
          } else {
            throw new PaymentError(
              PaymentErrorType.DATABASE_ERROR,
              `決済レコードの作成に失敗しました: ${insertError.message}`,
              insertError
            );
          }
        } else {
          targetPaymentId = payment!.id as string;
        }
      }

      // Stripe Checkout Sessionを作成 (Idempotency-Key 対応)

      // 統一フォーマット: checkout:<eventId>:<userId>:<amount>:<currency>
      const idemKey = generateIdempotencyKey(
        "checkout",
        params.eventId,
        params.userId,
        { amount: params.amount, currency: "jpy" }
      );

      const requestOptions = createStripeRequestOptions(idemKey);

      const createSession = async () =>
        await this.stripe.checkout.sessions.create(
          {
            payment_method_types: ["card"],
            line_items: [
              {
                price_data: {
                  currency: "jpy",
                  product_data: {
                    name: params.eventTitle,
                    description: "イベント参加費",
                  },
                  unit_amount: params.amount,
                },
                quantity: 1,
              },
            ],
            mode: "payment",
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
            metadata: {
              payment_id: targetPaymentId,
              attendance_id: params.attendanceId,
            },
            payment_intent_data: {
              metadata: {
                payment_id: targetPaymentId,
                attendance_id: params.attendanceId,
              },
              ...(params.transferGroup ? { transfer_group: params.transferGroup } : {}),
            },
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
          },
          requestOptions
        );

      const session = await retryWithIdempotency(createSession);

      // 決済レコードにセッションIDを更新
      const { error: updateError } = await this.supabase
        .from("payments")
        .update({
          stripe_session_id: session.id,
        })
        .eq("id", targetPaymentId);

      if (updateError) {
        // セッションは作成されたが、DBの更新に失敗した場合はハンドラに記録
        await this.errorHandler.logError(
          new PaymentError(
            PaymentErrorType.DATABASE_ERROR,
            `Failed to update payment record with session ID: ${updateError.message}`,
            updateError as unknown as Error
          ),
          { operation: "updateStripeSessionId", paymentId: targetPaymentId, sessionId: session.id }
        );
        // セッションは有効なので処理は続行
      }

      return {
        sessionUrl: session.url!,
        sessionId: session.id,
      };
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      // Stripeエラーの詳細を判定
      if (error && typeof error === "object" && (error as { type?: string }).type) {
        const stripeError = error as { message?: string };
        throw new PaymentError(
          PaymentErrorType.STRIPE_API_ERROR,
          `Stripe決済セッションの作成に失敗しました: ${stripeError.message || "不明なエラー"}`,
          error as unknown as Error
        );
      }

      throw new PaymentError(
        PaymentErrorType.STRIPE_API_ERROR,
        "Stripe決済セッションの作成に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 現金決済レコードを作成する
   */
  async createCashPayment(params: CreateCashPaymentParams): Promise<CreateCashPaymentResult> {
    try {
      const { data: payment, error } = await this.supabase
        .from("payments")
        .insert({
          attendance_id: params.attendanceId,
          method: "cash",
          amount: params.amount,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        // 重複エラーの場合は専用のエラータイプを使用
        if (error.code === "23505") {
          throw new PaymentError(
            PaymentErrorType.PAYMENT_ALREADY_EXISTS,
            "この参加記録に対する決済レコードは既に存在します",
            error
          );
        }

        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `現金決済レコードの作成に失敗しました: ${error.message}`,
          error
        );
      }

      return {
        paymentId: payment.id,
      };
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "現金決済レコードの作成に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 決済ステータスを更新する
   */
  async updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void> {
    try {
      const updateData: {
        status: PaymentStatus;
        updated_at: string;
        paid_at?: string;
        stripe_payment_intent_id?: string | null;
      } = {
        status: params.status,
        updated_at: new Date().toISOString(),
      };

      if (params.paidAt) {
        updateData.paid_at = params.paidAt.toISOString();
      }

      if (params.stripePaymentIntentId) {
        updateData.stripe_payment_intent_id = params.stripePaymentIntentId;
      }

      const { data, error } = await this.supabase
        .from("payments")
        .update(updateData)
        .eq("id", params.paymentId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済ステータスの更新に失敗しました: ${error.message}`,
          error
        );
      }

      if (!data) {
        throw new PaymentError(
          PaymentErrorType.PAYMENT_NOT_FOUND,
          "指定された決済レコードが見つかりません"
        );
      }
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済ステータスの更新に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 参加記録IDから決済情報を取得する
   */
  async getPaymentByAttendance(attendanceId: string): Promise<Payment | null> {
    try {
      const { data, error } = await this.supabase
        .from("payments")
        .select("*")
        .eq("attendance_id", attendanceId)
        .maybeSingle();

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済情報の取得に失敗しました: ${error.message}`,
          error
        );
      }

      if (!data) return null;
      return data as Payment;
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済情報の取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 決済IDから決済情報を取得する
   */
  async getPaymentById(paymentId: string): Promise<Payment | null> {
    try {
      const { data, error } = await this.supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済情報の取得に失敗しました: ${error.message}`,
          error
        );
      }

      if (!data) return null;
      return data as Payment;
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済情報の取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * イベントの決済リストを取得する（主催者用）
   */
  async getPaymentsByEvent(eventId: string, userId: string): Promise<Payment[]> {
    try {
      // イベントの主催者権限をチェックしつつ決済情報を取得
      const { data, error } = await this.supabase
        .from("payments")
        .select(
          `
          *,
          attendances!inner (
            id,
            events!inner (
              id,
              created_by
            )
          )
        `
        )
        .eq("attendances.events.id", eventId)
        .eq("attendances.events.created_by", userId);

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `イベント決済情報の取得に失敗しました: ${error.message}`,
          error
        );
      }

      // ネストしたデータから決済情報のみを抽出
      return data.map((item) => ({
        id: item.id,
        attendance_id: item.attendance_id,
        method: item.method as PaymentMethod,
        amount: item.amount,
        status: item.status as PaymentStatus,
        stripe_payment_intent_id: item.stripe_payment_intent_id,
        webhook_event_id: item.webhook_event_id,
        webhook_processed_at: item.webhook_processed_at,
        paid_at: item.paid_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "イベント決済情報の取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 決済レコードを削除する
   */
  async deletePayment(paymentId: string): Promise<void> {
    try {
      const { error } = await this.supabase.from("payments").delete().eq("id", paymentId);

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコードの削除に失敗しました: ${error.message}`,
          error
        );
      }
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済レコードの削除に失敗しました",
        error as Error
      );
    }
  }
}

/**
 * PaymentErrorHandlerの実装クラス
 */
export class PaymentErrorHandler implements IPaymentErrorHandler {
  /**
   * 決済エラーを処理し、適切な対応を決定する
   */
  async handlePaymentError(error: PaymentError): Promise<ErrorHandlingResult> {
    return ERROR_HANDLING_BY_TYPE[error.type] ?? {
      userMessage: "予期しないエラーが発生しました。管理者にお問い合わせください。",
      shouldRetry: false,
      logLevel: "error",
    };
  }

  /**
   * エラーをログに記録する
   */
  async logError(error: PaymentError, context?: Record<string, unknown>): Promise<void> {
    const stripeRequestId =
      error.cause && typeof error.cause === "object" && "requestId" in error.cause
        ? (error.cause as { requestId?: string }).requestId
        : undefined;

    const logData = {
      error_type: error.type,
      message: error.message,
      stack: error.stack,
      stripe_request_id: stripeRequestId,
      context,
    };

    logger.error("payment_error", logData);
  }
}
