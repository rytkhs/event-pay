/**
 * PaymentServiceの基本実装
 */

import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
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
  private supabase: ReturnType<typeof createClient<Database>>;
  private errorHandler: IPaymentErrorHandler;

  constructor(supabaseUrl: string, supabaseKey: string, errorHandler: IPaymentErrorHandler) {
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
    this.errorHandler = errorHandler;
  }

  /**
   * Stripe決済セッションを作成する
   * 注意: この実装はプレースホルダーです。実際のStripe統合は後のタスクで実装されます。
   */
  async createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult> {
    try {
      // まず決済レコードを作成
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
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコードの作成に失敗しました: ${insertError.message}`,
          insertError
        );
      }

      // TODO: 実際のStripe Checkout Session作成は後のタスクで実装
      // 現在はモックレスポンスを返す
      return {
        sessionUrl: `https://checkout.stripe.com/pay/mock_session_${payment.id}`,
        sessionId: `cs_mock_${payment.id}`,
      };
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
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
      const updateData: any = {
        status: params.status,
        updated_at: new Date().toISOString(),
      };

      if (params.paidAt) {
        updateData.paid_at = params.paidAt.toISOString();
      }

      if (params.stripePaymentIntentId) {
        updateData.stripe_payment_intent_id = params.stripePaymentIntentId;
      }

      const { error } = await this.supabase
        .from("payments")
        .update(updateData)
        .eq("id", params.paymentId);

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済ステータスの更新に失敗しました: ${error.message}`,
          error
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
        .single();

      if (error) {
        // レコードが見つからない場合はnullを返す
        if (error.code === "PGRST116") {
          return null;
        }

        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済情報の取得に失敗しました: ${error.message}`,
          error
        );
      }

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
        .single();

      if (error) {
        // レコードが見つからない場合はnullを返す
        if (error.code === "PGRST116") {
          return null;
        }

        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済情報の取得に失敗しました: ${error.message}`,
          error
        );
      }

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
    switch (error.type) {
      case PaymentErrorType.INVALID_PAYMENT_METHOD:
      case PaymentErrorType.INVALID_AMOUNT:
        return {
          userMessage: "入力内容に誤りがあります。確認して再度お試しください。",
          shouldRetry: false,
          logLevel: "warn",
        };

      case PaymentErrorType.PAYMENT_ALREADY_EXISTS:
        return {
          userMessage: "この参加に対する決済は既に作成されています。",
          shouldRetry: false,
          logLevel: "info",
        };

      case PaymentErrorType.ATTENDANCE_NOT_FOUND:
      case PaymentErrorType.EVENT_NOT_FOUND:
        return {
          userMessage: "指定された情報が見つかりません。",
          shouldRetry: false,
          logLevel: "warn",
        };

      case PaymentErrorType.INSUFFICIENT_FUNDS:
      case PaymentErrorType.CARD_DECLINED:
        return {
          userMessage: "決済が承認されませんでした。カード情報を確認してください。",
          shouldRetry: true,
          logLevel: "info",
        };

      case PaymentErrorType.STRIPE_API_ERROR:
        return {
          userMessage: "決済処理中にエラーが発生しました。しばらく待ってから再度お試しください。",
          shouldRetry: true,
          logLevel: "error",
        };

      case PaymentErrorType.DATABASE_ERROR:
        return {
          userMessage: "システムエラーが発生しました。管理者にお問い合わせください。",
          shouldRetry: false,
          logLevel: "error",
        };

      case PaymentErrorType.WEBHOOK_PROCESSING_ERROR:
        return {
          userMessage: "決済処理の確認中です。しばらくお待ちください。",
          shouldRetry: false,
          logLevel: "error",
        };

      default:
        return {
          userMessage: "予期しないエラーが発生しました。管理者にお問い合わせください。",
          shouldRetry: false,
          logLevel: "error",
        };
    }
  }

  /**
   * エラーをログに記録する
   */
  async logError(error: PaymentError, context?: Record<string, unknown>): Promise<void> {
    const logData = {
      timestamp: new Date().toISOString(),
      errorType: error.type,
      message: error.message,
      stack: error.stack,
      cause: error.cause?.message,
      context,
    };

    // TODO: 実際のログシステムとの連携は後で実装
    console.error("PaymentError:", logData);
  }
}
