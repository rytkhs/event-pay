/**
 * PaymentServiceの基本実装
 */

import type { SupabaseClient } from "@supabase/supabase-js";
// import type { PostgrestError } from "@supabase/supabase-js";
import { PostgrestError } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";
import { createPaymentLogger, type PaymentLogger } from "@core/logging/payment-logger";
import { stripe } from "@core/stripe/client";
import * as DestinationCharges from "@core/stripe/destination-charges";
import { convertStripeError } from "@core/stripe/error-handler";
import { assertStripePayment } from "@core/utils/stripe-guards";

import { Database } from "@/types/database";

import { ERROR_HANDLING_BY_TYPE } from "./error-mapping";
import { ApplicationFeeCalculator } from "./fee-config/application-fee-calculator";
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

/**
 * PaymentServiceの実装クラス
 */
export class PaymentService implements IPaymentService {
  private supabase: SupabaseClient<Database, "public">;
  private stripe = stripe;
  private errorHandler: IPaymentErrorHandler;
  private applicationFeeCalculator: ApplicationFeeCalculator;
  private paymentLogger: PaymentLogger;

  constructor(
    supabaseClient: SupabaseClient<Database, "public">,
    errorHandler: IPaymentErrorHandler
  ) {
    this.supabase = supabaseClient;
    this.errorHandler = errorHandler;
    this.applicationFeeCalculator = new ApplicationFeeCalculator(supabaseClient);
    this.paymentLogger = createPaymentLogger({ service: "PaymentService" });
  }

  /**
   * Stripe決済セッションを作成する
   *
   * 重複作成ガードについて:
   * - 重複検知と一意性の最終責務は本メソッド（Service）に集約する。
   * - 振る舞い（DBの降格禁止ルールに整合）:
   *   - 参加に紐づく既存決済が支払完了系（paid/received/completed/refunded）の場合は
   *     PaymentErrorType.PAYMENT_ALREADY_EXISTS を投げる。
   *   - openが pending の場合のみ同レコードを再利用（Stripe識別子のリセットと金額更新）。
   *   - openが failed の場合は新規に pending レコードを作成（failed→pending の降格は行わない）。
   *   - DB一意制約違反（23505）は並行作成とみなし、直近の open を再利用する。
   * - Action 層では重複チェックを省略してよい（最終判断は本メソッド）。
   */
  async createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult> {
    const correlationId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const contextLogger = this.paymentLogger.withContext({
      attendance_id: params.attendanceId,
      event_id: params.eventId,
      amount: params.amount,
      payment_method: "stripe",
      correlation_id: correlationId,
      connect_account_id: params.destinationCharges?.destinationAccountId,
    });

    contextLogger.startOperation("create_stripe_session", {
      actor_id: params.actorId,
      event_title: params.eventTitle,
    });

    try {
      // 既存決済の状態を履歴化設計に合わせて取得（open優先・履歴は無視）
      let targetPaymentId: string;

      // openは pending を最優先、無ければ failed を参照
      type OpenPaymentRow = {
        id: string;
        status: PaymentStatus;
        method: PaymentMethod;
        stripe_payment_intent_id: string | null;
        paid_at: string | null;
        created_at: string | null;
        updated_at: string | null;
      };
      let openPayment: OpenPaymentRow | null = null;

      const { data: openPending, error: openPendingError } = await this.supabase
        .from("payments")
        .select(
          "id, status, method, amount, checkout_idempotency_key, checkout_key_revision, stripe_payment_intent_id, paid_at, created_at, updated_at"
        )
        .eq("attendance_id", params.attendanceId)
        .eq("status", "pending")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openPendingError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコード（open/pending）の検索に失敗しました: ${openPendingError.message}`,
          openPendingError
        );
      }
      if (openPending) {
        const row = openPending as any;
        openPayment = {
          id: row.id,
          status: row.status as PaymentStatus,
          method: row.method as PaymentMethod,
          // hydrate additional fields for idempotency handling
          amount: row.amount as number,
          checkout_idempotency_key: (row.checkout_idempotency_key as string) ?? null,
          checkout_key_revision: (row.checkout_key_revision as number | null) ?? 0,
          stripe_payment_intent_id: row.stripe_payment_intent_id,
          paid_at: row.paid_at ?? null,
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
        } as any;
      } else {
        const { data: openFailed, error: openFailedError } = await this.supabase
          .from("payments")
          .select(
            "id, status, method, amount, checkout_idempotency_key, checkout_key_revision, stripe_payment_intent_id, paid_at, created_at, updated_at"
          )
          .eq("attendance_id", params.attendanceId)
          .eq("status", "failed")
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openFailedError) {
          throw new PaymentError(
            PaymentErrorType.DATABASE_ERROR,
            `決済レコード（open/failed）の検索に失敗しました: ${openFailedError.message}`,
            openFailedError
          );
        }
        if (openFailed) {
          const row = openFailed as any;
          openPayment = {
            id: row.id,
            status: row.status as PaymentStatus,
            method: row.method as PaymentMethod,
            // hydrate additional fields for idempotency handling
            amount: row.amount as number,
            checkout_idempotency_key: (row.checkout_idempotency_key as string) ?? null,
            checkout_key_revision: (row.checkout_key_revision as number | null) ?? 0,
            stripe_payment_intent_id: row.stripe_payment_intent_id,
            paid_at: row.paid_at ?? null,
            created_at: row.created_at ?? null,
            updated_at: row.updated_at ?? null,
          } as any;
        }
      }

      const { data: latestTerminal, error: terminalFindError } = await this.supabase
        .from("payments")
        .select("id, status, paid_at, created_at, updated_at")
        .eq("attendance_id", params.attendanceId)
        .in("status", ["paid", "received", "completed", "refunded"])
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (terminalFindError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコード（終端）の検索に失敗しました: ${terminalFindError.message}`,
          terminalFindError
        );
      }

      // 支払完了系が直近に存在する場合は受付不可
      if (latestTerminal) {
        if (!openPayment) {
          throw new PaymentError(
            PaymentErrorType.PAYMENT_ALREADY_EXISTS,
            "この参加に対する決済は既に完了済みです"
          );
        }

        const terminalTime = (latestTerminal.paid_at ??
          latestTerminal.updated_at ??
          latestTerminal.created_at) as string | null;
        const openTime = (openPayment.updated_at ?? openPayment.created_at) as string | null;
        if (
          terminalTime &&
          openTime &&
          new Date(terminalTime).getTime() > new Date(openTime).getTime()
        ) {
          throw new PaymentError(
            PaymentErrorType.PAYMENT_ALREADY_EXISTS,
            "この参加に対する決済は既に完了済みです"
          );
        }
      }

      if (openPayment) {
        if ((openPayment.status as PaymentStatus) === "pending") {
          // 再試行: pending は再利用（Stripe識別子のリセットと金額更新）
          const { error: reuseError } = await this.supabase
            .from("payments")
            .update({
              amount: params.amount,
              // status はすでに pending のため変更しない
              stripe_payment_intent_id: null,
              stripe_checkout_session_id: null,
            })
            .eq("id", openPayment.id);

          if (reuseError) {
            throw new PaymentError(
              PaymentErrorType.DATABASE_ERROR,
              `既存決済の更新に失敗しました: ${reuseError.message}`,
              reuseError
            );
          }
          targetPaymentId = openPayment.id as string;
        } else {
          // open が failed の場合は新規 pending を作成（降格禁止ルールに従う）
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
            if (insertError.code === "23505") {
              // 並行作成: 直近の open を再利用
              const { data: concurrentOpen, error: refetchOpenError } = await this.supabase
                .from("payments")
                .select("id, status, updated_at, created_at")
                .eq("attendance_id", params.attendanceId)
                .in("status", ["pending", "failed"])
                .order("updated_at", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (refetchOpenError) {
                throw new PaymentError(
                  PaymentErrorType.DATABASE_ERROR,
                  `既存open決済の再取得に失敗しました: ${refetchOpenError.message}`,
                  refetchOpenError
                );
              }

              if (concurrentOpen) {
                // pending の場合のみ再利用、failed の場合は再試行を促す
                if ((concurrentOpen.status as PaymentStatus) === "pending") {
                  const { error: dupReuseError } = await this.supabase
                    .from("payments")
                    .update({
                      amount: params.amount,
                      stripe_payment_intent_id: null,
                      stripe_checkout_session_id: null,
                    })
                    .eq("id", concurrentOpen.id as string);

                  if (dupReuseError) {
                    throw new PaymentError(
                      PaymentErrorType.DATABASE_ERROR,
                      `既存決済の更新に失敗しました: ${dupReuseError.message}`,
                      dupReuseError
                    );
                  }

                  targetPaymentId = concurrentOpen.id as string;
                } else {
                  throw new PaymentError(
                    PaymentErrorType.DATABASE_ERROR,
                    "決済レコードの作成に失敗しました（再試行してください）",
                    insertError
                  );
                }
              } else {
                throw new PaymentError(
                  PaymentErrorType.DATABASE_ERROR,
                  `決済レコードの作成に失敗しました: ${insertError.message}`,
                  insertError
                );
              }
            } else {
              throw new PaymentError(
                PaymentErrorType.DATABASE_ERROR,
                `決済レコードの作成に失敗しました: ${insertError.message}`,
                insertError
              );
            }
          } else {
            assertStripePayment(payment, "payment lookup");
            targetPaymentId = payment.id;
          }
        }
      } else {
        // openが無ければ新規作成
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
          if (insertError.code === "23505") {
            // 同時実行: openが作られたのでopenを再取得して再利用
            const { data: concurrentOpen, error: refetchOpenError } = await this.supabase
              .from("payments")
              .select("id, status, updated_at, created_at")
              .eq("attendance_id", params.attendanceId)
              .in("status", ["pending", "failed"])
              .order("updated_at", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (refetchOpenError) {
              throw new PaymentError(
                PaymentErrorType.DATABASE_ERROR,
                `既存open決済の再取得に失敗しました: ${refetchOpenError.message}`,
                refetchOpenError
              );
            }

            if (concurrentOpen) {
              if ((concurrentOpen.status as PaymentStatus) === "pending") {
                const { error: dupReuseError } = await this.supabase
                  .from("payments")
                  .update({
                    amount: params.amount,
                    stripe_payment_intent_id: null,
                    stripe_checkout_session_id: null,
                  })
                  .eq("id", concurrentOpen.id as string);

                if (dupReuseError) {
                  throw new PaymentError(
                    PaymentErrorType.DATABASE_ERROR,
                    `既存決済の更新に失敗しました: ${dupReuseError.message}`,
                    dupReuseError
                  );
                }

                targetPaymentId = concurrentOpen.id as string;
              } else {
                throw new PaymentError(
                  PaymentErrorType.DATABASE_ERROR,
                  "決済レコードの作成に失敗しました（再試行してください）",
                  insertError
                );
              }
            } else {
              // openが無いのに23505 → 直近で終端化された可能性
              const { data: terminalAfterRace } = await this.supabase
                .from("payments")
                .select("id")
                .eq("attendance_id", params.attendanceId)
                .in("status", ["paid", "received", "completed", "refunded"])
                .order("paid_at", { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle();

              if (terminalAfterRace) {
                throw new PaymentError(
                  PaymentErrorType.PAYMENT_ALREADY_EXISTS,
                  "この参加に対する決済は既に完了済みです",
                  insertError
                );
              }

              throw new PaymentError(
                PaymentErrorType.DATABASE_ERROR,
                `決済レコードの作成に失敗しました: ${insertError.message}`,
                insertError
              );
            }
          } else {
            throw new PaymentError(
              PaymentErrorType.DATABASE_ERROR,
              `決済レコードの作成に失敗しました: ${insertError.message}`,
              insertError
            );
          }
        } else {
          assertStripePayment(payment, "payment lookup");
          targetPaymentId = payment.id;
        }
      }

      // Stripe Checkout Sessionを作成（Destination chargesに統一）
      if (!params.destinationCharges) {
        contextLogger.logPaymentError(
          "create_stripe_session",
          new Error("Destination charges configuration is required"),
          { payment_phase: "validation" }
        );
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "Destination charges configuration is required"
        );
      }
      const { destinationAccountId, userEmail, userName, setupFutureUsage } =
        params.destinationCharges;

      // Connect Account情報をログに記録
      contextLogger.logConnectAccountValidation(destinationAccountId, true, {
        user_email: userEmail,
        user_name: userName,
        payment_id: targetPaymentId,
      });

      // TODO: Connect Account の事前検証（別タスクで実装予定）
      // await this.validateConnectAccount(destinationAccountId);

      // Application fee計算
      const feeCalculation = await this.applicationFeeCalculator.calculateApplicationFee(
        params.amount
      );

      // Customer作成・取得
      let customerId: string | undefined;
      if (userEmail || userName) {
        const customer = await DestinationCharges.createOrRetrieveCustomer({
          email: userEmail,
          name: userName,
          metadata: {
            actor_id: params.actorId,
            event_id: params.eventId,
          },
        });
        customerId = customer.id;
      }

      // Destination charges用のCheckout Session作成
      // Idempotency-Key: ボディ差分（特に金額差）時はキーを回転。そうでなければ再利用
      let idempotencyKeyToUse: string | null =
        (openPayment as any)?.checkout_idempotency_key ?? null;
      let checkoutKeyRevisionToSave: number = (openPayment as any)?.checkout_key_revision ?? 0;
      const amountChanged = Boolean(
        openPayment &&
          (openPayment as any).status === "pending" &&
          typeof (openPayment as any).amount === "number" &&
          (openPayment as any).amount !== params.amount
      );
      if (!idempotencyKeyToUse || amountChanged) {
        const { generateIdempotencyKey } = await import("@core/stripe/client");
        idempotencyKeyToUse = generateIdempotencyKey("checkout");
        if (openPayment) {
          checkoutKeyRevisionToSave = ((openPayment as any).checkout_key_revision ?? 0) + 1;
        }
      }
      const session = await DestinationCharges.createDestinationCheckoutSession({
        eventId: params.eventId,
        eventTitle: params.eventTitle,
        amount: params.amount,
        destinationAccountId,
        platformFeeAmount: feeCalculation.applicationFeeAmount,
        customerId,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        actorId: params.actorId,
        metadata: {
          payment_id: targetPaymentId,
          attendance_id: params.attendanceId,
          event_title: params.eventTitle,
        },
        setupFutureUsage,
        idempotencyKey: idempotencyKeyToUse ?? undefined,
      });

      // --- DB に Destination charges 関連情報を保存 (リトライ付き) ---
      const updateDestinationPayload = {
        stripe_checkout_session_id: session.id,
        destination_account_id: destinationAccountId,
        application_fee_amount: feeCalculation.applicationFeeAmount,
        transfer_group: `event_${params.eventId}_payout`,
        stripe_customer_id: customerId,
        checkout_idempotency_key: idempotencyKeyToUse,
        checkout_key_revision: checkoutKeyRevisionToSave,
      } as const;

      const MAX_DB_UPDATE_RETRIES = 3;
      let lastDbError: PostgrestError | null = null;
      for (let i = 0; i < MAX_DB_UPDATE_RETRIES; i++) {
        const { error: updateErr } = await this.supabase
          .from("payments")
          .update(updateDestinationPayload)
          .eq("id", targetPaymentId);

        if (!updateErr) {
          lastDbError = null;
          break; // success
        }
        lastDbError = updateErr;
        // 短い間隔で再試行 (指数バックオフ不要な軽量処理)
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }

      if (lastDbError) {
        const dbError = new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `Failed to update payment record with destination charges data after retries: ${lastDbError.message}`,
          lastDbError as unknown as Error
        );
        await this.errorHandler.logError(dbError, {
          operation: "updateDestinationChargesData",
          paymentId: targetPaymentId,
          sessionId: session.id,
          destinationAccountId,
          applicationFeeAmount: feeCalculation.applicationFeeAmount,
        });
        // 決済整合性のために処理を中断
        throw dbError;
      }

      // 既存のログも残しつつ、構造化ログも追加
      logger.info("Destination charges session created", {
        tag: "destinationChargesCreated",
        service: "PaymentService",
        paymentId: targetPaymentId,
        sessionId: session.id,
        amount: params.amount,
        applicationFeeAmount: feeCalculation.applicationFeeAmount,
        destinationAccountId,
        transferGroup: `event_${params.eventId}_payout`,
        actorId: params.actorId,
      });

      // 構造化ログでセッション作成成功を記録
      contextLogger.logSessionCreation(true, {
        payment_id: targetPaymentId,
        stripe_session_id: session.id,
        session_url: session.url || undefined,
        application_fee_amount: feeCalculation.applicationFeeAmount,
        transfer_group: `event_${params.eventId}_payout`,
      });

      if (!session.url) {
        throw new PaymentError(
          PaymentErrorType.STRIPE_API_ERROR,
          "Stripe session URL is not available"
        );
      }

      // 最終成功ログ
      contextLogger.operationSuccess("create_stripe_session", {
        payment_id: targetPaymentId,
        stripe_session_id: session.id,
        session_url: session.url,
      });

      return {
        sessionUrl: session.url,
        sessionId: session.id,
      };
    } catch (error) {
      if (error instanceof PaymentError) {
        // PaymentErrorの場合もログに記録
        contextLogger.logPaymentError("create_stripe_session", error);
        throw error;
      }

      // 構造化ログでエラーを記録
      contextLogger.logPaymentError("create_stripe_session", error);

      // Stripe固有エラーの場合は汎用ハンドラーで詳細分類
      if (error && typeof error === "object" && "type" in error) {
        const stripeError = error as any;
        if (stripeError.type && typeof stripeError.type === "string") {
          const enhancedError = convertStripeError(stripeError, {
            operation: "create_stripe_session",
            connectAccountId: params.destinationCharges?.destinationAccountId,
            amount: params.amount,
            sessionId: undefined,
            additionalData: {
              event_id: params.eventId,
              attendance_id: params.attendanceId,
              actor_id: params.actorId,
            },
          });
          throw enhancedError;
        }
      }

      // その他のエラーの場合は汎用的なPaymentError
      const genericError = new PaymentError(
        PaymentErrorType.STRIPE_API_ERROR,
        "Stripe決済セッションの作成に失敗しました",
        error as Error
      );
      throw genericError;
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
    const contextLogger = this.paymentLogger.withContext({
      payment_id: params.paymentId,
      user_id: params.userId,
      correlation_id: `status_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });

    contextLogger.startOperation("update_payment_status", {
      expected_version: params.expectedVersion,
      new_status: params.status,
      notes: params.notes,
    });

    try {
      // 楽観的ロック対応：現金決済の場合はRPCを使用、それ以外は従来通り
      if (params.expectedVersion !== undefined && params.userId) {
        // 楽観的ロック付きの安全更新（現金決済用）
        await this.updatePaymentStatusSafe(params);
      } else {
        // 従来の更新方法（Stripe決済用など）
        await this.updatePaymentStatusLegacy(params);
      }

      // 成功ログを記録
      contextLogger.operationSuccess("update_payment_status");
    } catch (error) {
      // エラーログを記録
      contextLogger.logPaymentError("update_payment_status", error);

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
   * 楽観的ロック付きの決済ステータス更新（現金決済用）
   */
  private async updatePaymentStatusSafe(params: UpdatePaymentStatusParams): Promise<void> {
    try {
      if (!params.expectedVersion) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "Expected version is required for safe status update"
        );
      }
      if (!params.userId) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "User ID is required for status update"
        );
      }

      const { data: _data, error } = await this.supabase.rpc("rpc_update_payment_status_safe", {
        p_payment_id: params.paymentId,
        p_new_status: params.status,
        p_expected_version: params.expectedVersion,
        p_user_id: params.userId,
        p_notes: params.notes ?? undefined,
      });

      if (error) {
        // PostgreSQLのエラーコードを確認
        if (error.code === "40001") {
          // serialization_failure = 楽観的ロック競合
          throw new PaymentError(
            PaymentErrorType.CONCURRENT_UPDATE,
            "他のユーザーによって同時に更新されました。最新の状態を確認してから再試行してください。"
          );
        } else if (error.code === "P0001") {
          // 権限エラー
          throw new PaymentError(
            PaymentErrorType.FORBIDDEN,
            "この操作を実行する権限がありません。"
          );
        } else if (error.code === "P0002") {
          // 決済レコードが見つからない
          throw new PaymentError(
            PaymentErrorType.PAYMENT_NOT_FOUND,
            "指定された決済レコードが見つかりません。"
          );
        } else if (error.code === "P0003") {
          // 現金決済でない
          throw new PaymentError(
            PaymentErrorType.INVALID_PAYMENT_METHOD,
            "現金決済以外は手動更新できません。"
          );
        } else {
          throw new PaymentError(
            PaymentErrorType.DATABASE_ERROR,
            `決済ステータスの更新に失敗しました: ${error.message}`,
            error
          );
        }
      }

      // 正常に更新完了
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
   * 従来の決済ステータス更新（Stripe決済用など）
   */
  private async updatePaymentStatusLegacy(params: UpdatePaymentStatusParams): Promise<void> {
    const updateData: {
      status: PaymentStatus;
      paid_at?: string;
      stripe_payment_intent_id?: string | null;
    } = {
      status: params.status,
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
  }

  /**
   * 複数の決済ステータスを一括更新する（楽観的ロック対応）
   */
  async bulkUpdatePaymentStatus(
    updates: Array<{
      paymentId: string;
      status: PaymentStatus;
      expectedVersion: number;
    }>,
    userId: string,
    notes?: string
  ): Promise<{
    successCount: number;
    failureCount: number;
    failures: Array<{
      paymentId: string;
      error: string;
    }>;
  }> {
    const contextLogger = this.paymentLogger.withContext({
      user_id: userId,
      correlation_id: `bulk_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      bulk_operation_count: updates.length,
    });

    contextLogger.startOperation("bulk_update_payment_status", {
      update_count: updates.length,
      notes,
    });

    try {
      // 入力バリデーション
      if (updates.length === 0) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "更新対象の決済が指定されていません"
        );
      }

      if (updates.length > 50) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "一度に更新できる決済は最大50件です"
        );
      }

      // 一括更新用RPCに渡すJSONデータを構築
      const paymentUpdates = updates.map((update) => ({
        payment_id: update.paymentId,
        expected_version: update.expectedVersion,
        new_status: update.status,
      }));

      const { data, error } = await this.supabase.rpc("rpc_bulk_update_payment_status_safe", {
        p_payment_updates: paymentUpdates,
        p_user_id: userId,
        p_notes: notes ?? undefined,
      });

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `一括更新に失敗しました: ${error.message}`,
          error
        );
      }

      // RPC結果をパース
      const result = data as {
        success_count: number;
        failure_count: number;
        failures: Array<{
          payment_id: string;
          error_code: string;
          error_message: string;
        }>;
      };

      const response = {
        successCount: result.success_count,
        failureCount: result.failure_count,
        failures: result.failures.map((failure) => ({
          paymentId: failure.payment_id,
          error: failure.error_message,
        })),
      };

      // 一括更新の結果をログに記録
      contextLogger.logBulkStatusUpdate(result.success_count, result.failure_count, {
        total_updates: updates.length,
        failures: result.failures.length > 0 ? result.failures : undefined,
      });

      contextLogger.operationSuccess("bulk_update_payment_status");

      return response;
    } catch (error) {
      // エラーログを記録
      contextLogger.logPaymentError("bulk_update_payment_status", error);

      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "一括更新に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 参加記録IDから決済情報を取得する
   */
  async getPaymentByAttendance(attendanceId: string): Promise<Payment | null> {
    try {
      // open（pending/failed）を優先的に返す
      const { data: openPayment, error: openError } = await this.supabase
        .from("payments")
        .select("*")
        .eq("attendance_id", attendanceId)
        .in("status", ["pending", "failed"])
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済情報の取得に失敗しました: ${openError.message}`,
          openError
        );
      }

      if (openPayment) return openPayment as Payment;

      // openが無い場合は、最新の終端系（paid/received/completed/refunded）を返す
      const { data: latestTerminal, error: terminalError } = await this.supabase
        .from("payments")
        .select("*")
        .eq("attendance_id", attendanceId)
        .in("status", ["paid", "received", "completed", "refunded"])
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (terminalError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済情報の取得に失敗しました: ${terminalError.message}`,
          terminalError
        );
      }

      if (!latestTerminal) return null;
      return latestTerminal as Payment;
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

  /**
   * Connect Account の事前検証を行う
   * @param accountId Stripe Connect Account ID
   * @throws PaymentError Connect Account に問題がある場合
   */
  private async validateConnectAccount(accountId: string): Promise<void> {
    try {
      // Stripe APIでConnect Account情報を取得
      const account = await this.stripe.accounts.retrieve(accountId);

      // 1. アカウントが制限されていないかチェック
      if (account.requirements?.disabled_reason) {
        logger.warn("Connect Account is restricted", {
          tag: "connectAccountRestricted",
          account_id: accountId,
          disabled_reason: account.requirements.disabled_reason,
        });
        throw new PaymentError(
          PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
          `Connect Account is restricted: ${account.requirements.disabled_reason}`,
          { accountId, disabledReason: account.requirements.disabled_reason }
        );
      }

      // 2. payouts_enabled がtrueかチェック
      if (!account.payouts_enabled) {
        logger.warn("Connect Account payouts not enabled", {
          tag: "connectAccountPayoutsDisabled",
          account_id: accountId,
          payouts_enabled: account.payouts_enabled,
        });
        throw new PaymentError(
          PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
          "Connect Account payouts are not enabled",
          { accountId, payoutsEnabled: account.payouts_enabled }
        );
      }

      // 3. transfers capability がactiveかチェック
      const transfersCap = account.capabilities?.transfers;
      const isTransfersActive = (() => {
        if (transfersCap === "active") return true;
        if (typeof transfersCap === "object" && transfersCap && "status" in transfersCap) {
          return (transfersCap as any).status === "active";
        }
        return false;
      })();

      if (!isTransfersActive) {
        logger.warn("Connect Account transfers capability not active", {
          tag: "connectAccountTransfersInactive",
          account_id: accountId,
          transfers_capability: transfersCap,
        });
        throw new PaymentError(
          PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
          "Connect Account transfers capability is not active",
          { accountId, transfersCapability: transfersCap }
        );
      }

      logger.info("Connect Account validation passed", {
        tag: "connectAccountValidated",
        account_id: accountId,
        payouts_enabled: account.payouts_enabled,
        transfers_capability: transfersCap,
      });
    } catch (error) {
      // PaymentErrorはそのまま再スロー
      if (error instanceof PaymentError) {
        throw error;
      }

      // Stripe APIエラーの場合
      if (error && typeof error === "object" && "type" in error) {
        const stripeError = error as { message?: string; type?: string };

        // "No such account" エラーは CONNECT_ACCOUNT_NOT_FOUND として分類
        if (
          stripeError.message?.includes("No such account") ||
          stripeError.message?.includes("does not exist")
        ) {
          logger.error("Connect Account not found", {
            tag: "connectAccountNotFound",
            account_id: accountId,
            error_message: stripeError.message,
          });
          throw new PaymentError(
            PaymentErrorType.CONNECT_ACCOUNT_NOT_FOUND,
            `Connect Account not found: ${accountId}`,
            error
          );
        }

        // その他のStripe APIエラー
        logger.error("Connect Account validation failed - Stripe API error", {
          tag: "connectAccountValidationStripeError",
          account_id: accountId,
          error_type: stripeError.type,
          error_message: stripeError.message,
        });
        throw new PaymentError(
          PaymentErrorType.STRIPE_CONFIG_ERROR,
          `Connect Account validation failed: ${stripeError.message}`,
          error
        );
      }

      // その他の予期しないエラー
      logger.error("Connect Account validation failed - unexpected error", {
        tag: "connectAccountValidationUnexpectedError",
        account_id: accountId,
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      throw new PaymentError(
        PaymentErrorType.STRIPE_CONFIG_ERROR,
        "Connect Account validation failed due to unexpected error",
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
    return (
      ERROR_HANDLING_BY_TYPE[error.type] ?? {
        userMessage: "予期しないエラーが発生しました。管理者にお問い合わせください。",
        shouldRetry: false,
        logLevel: "error",
      }
    );
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
