/**
 * 決済データ検証ロジック
 */

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { IPaymentValidator } from "./interface";
import {
  CreateStripeSessionParams,
  CreateCashPaymentParams,
  UpdatePaymentStatusParams,
  PaymentError,
  PaymentErrorType,
  PaymentMethod,
  PaymentStatus,
} from "./types";

// Zodスキーマ定義
const paymentMethodSchema = z.enum(["stripe", "cash"]);
const paymentStatusSchema = z.enum([
  "pending",
  "paid",
  "received",
  "failed",
  "completed",
  "refunded",
  "waived",
]);

// サービス層（Stripeに渡す直前の最終パラメータ）用スキーマ
const createStripeSessionParamsSchema = z.object({
  attendanceId: z.string().uuid("参加記録IDは有効なUUIDである必要があります"),
  amount: z
    .number()
    .int("金額は整数である必要があります")
    .positive("金額は正の数である必要があります"),
  eventTitle: z
    .string()
    .min(1, "イベントタイトルは必須です")
    .max(200, "イベントタイトルは200文字以内である必要があります"),
  successUrl: z.string().url("成功時URLは有効なURLである必要があります"),
  cancelUrl: z.string().url("キャンセル時URLは有効なURLである必要があります"),
});

// APIルートの入力用スキーマ（eventTitleはサーバー側で取得するため不要）
const createStripeSessionRequestSchema = z.object({
  attendanceId: z.string().uuid("参加記録IDは有効なUUIDである必要があります"),
  amount: z
    .number()
    .int("金額は整数である必要があります")
    .positive("金額は正の数である必要があります"),
  successUrl: z.string().url("成功時URLは有効なURLである必要があります"),
  cancelUrl: z.string().url("キャンセル時URLは有効なURLである必要があります"),
});

const createCashPaymentParamsSchema = z.object({
  attendanceId: z.string().uuid("参加記録IDは有効なUUIDである必要があります"),
  amount: z
    .number()
    .int("金額は整数である必要があります")
    .positive("金額は正の数である必要があります"),
});

const updatePaymentStatusParamsSchema = z.object({
  paymentId: z.string().uuid("決済IDは有効なUUIDである必要があります"),
  status: paymentStatusSchema,
  paidAt: z.date().optional(),
  stripePaymentIntentId: z.string().optional(),
});

/**
 * PaymentValidatorの実装クラス
 */
export class PaymentValidator implements IPaymentValidator {
  private supabase: ReturnType<typeof createClient<Database>>;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
  }

  /**
   * Stripe決済セッション作成パラメータを検証する
   */
  async validateCreateStripeSessionParams(params: CreateStripeSessionParams): Promise<void> {
    try {
      // Zodスキーマによる基本検証
      createStripeSessionParamsSchema.parse(params);

      // ビジネスルール検証
      await this.validateAttendanceAccess(params.attendanceId);
      await this.validatePaymentAmount(params.amount);
      await this.validateNoDuplicatePayment(params.attendanceId);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PaymentError(
          PaymentErrorType.INVALID_PAYMENT_METHOD,
          `入力検証エラー: ${error.errors.map((e) => e.message).join(", ")}`,
          error
        );
      }

      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "パラメータ検証中にエラーが発生しました",
        error as Error
      );
    }
  }

  /**
   * 現金決済作成パラメータを検証する
   */
  async validateCreateCashPaymentParams(params: CreateCashPaymentParams): Promise<void> {
    try {
      // Zodスキーマによる基本検証
      createCashPaymentParamsSchema.parse(params);

      // ビジネスルール検証
      await this.validateAttendanceAccess(params.attendanceId);
      await this.validatePaymentAmount(params.amount);
      await this.validateNoDuplicatePayment(params.attendanceId);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PaymentError(
          PaymentErrorType.INVALID_PAYMENT_METHOD,
          `入力検証エラー: ${error.errors.map((e) => e.message).join(", ")}`,
          error
        );
      }

      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "パラメータ検証中にエラーが発生しました",
        error as Error
      );
    }
  }

  /**
   * 決済ステータス更新パラメータを検証する
   */
  async validateUpdatePaymentStatusParams(params: UpdatePaymentStatusParams): Promise<void> {
    try {
      // Zodスキーマによる基本検証
      updatePaymentStatusParamsSchema.parse(params);

      // ビジネスルール検証
      await this.validatePaymentExists(params.paymentId);
      await this.validateStatusTransition(params.paymentId, params.status);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PaymentError(
          PaymentErrorType.INVALID_PAYMENT_METHOD,
          `入力検証エラー: ${error.errors.map((e) => e.message).join(", ")}`,
          error
        );
      }

      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "パラメータ検証中にエラーが発生しました",
        error as Error
      );
    }
  }

  /**
   * 参加記録の存在と権限を検証する
   */
  async validateAttendanceAccess(attendanceId: string, userId?: string): Promise<void> {
    try {
      let query = this.supabase
        .from("attendances")
        .select("id, event_id, events!inner(id, created_by)")
        .eq("id", attendanceId);

      if (userId) {
        query = query.eq("events.created_by", userId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new PaymentError(
            PaymentErrorType.ATTENDANCE_NOT_FOUND,
            "指定された参加記録が見つかりません"
          );
        }

        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `参加記録の検証に失敗しました: ${error.message}`,
          error
        );
      }

      if (!data) {
        throw new PaymentError(
          PaymentErrorType.ATTENDANCE_NOT_FOUND,
          "指定された参加記録が見つかりません"
        );
      }
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "参加記録の検証中にエラーが発生しました",
        error as Error
      );
    }
  }

  /**
   * 決済金額の妥当性を検証する
   */
  async validatePaymentAmount(amount: number): Promise<void> {
    // 基本的な金額検証
    if (!Number.isInteger(amount)) {
      throw new PaymentError(PaymentErrorType.INVALID_AMOUNT, "金額は整数である必要があります");
    }

    if (amount <= 0) {
      throw new PaymentError(PaymentErrorType.INVALID_AMOUNT, "金額は正の数である必要があります");
    }

    // 最大金額制限（例：100万円）
    const MAX_AMOUNT = 1000000;
    if (amount > MAX_AMOUNT) {
      throw new PaymentError(
        PaymentErrorType.INVALID_AMOUNT,
        `金額は${MAX_AMOUNT.toLocaleString()}円以下である必要があります`
      );
    }

    // 最小金額制限（例：1円）
    const MIN_AMOUNT = 1;
    if (amount < MIN_AMOUNT) {
      throw new PaymentError(
        PaymentErrorType.INVALID_AMOUNT,
        `金額は${MIN_AMOUNT}円以上である必要があります`
      );
    }
  }

  /**
   * 重複決済の検証
   */
  private async validateNoDuplicatePayment(attendanceId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from("payments")
        .select("id")
        .eq("attendance_id", attendanceId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `重複チェック中にエラーが発生しました: ${error.message}`,
          error
        );
      }

      if (data) {
        throw new PaymentError(
          PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          "この参加記録に対する決済は既に存在します"
        );
      }
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "重複チェック中にエラーが発生しました",
        error as Error
      );
    }
  }

  /**
   * 決済レコードの存在を検証
   */
  private async validatePaymentExists(paymentId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from("payments")
        .select("id")
        .eq("id", paymentId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new PaymentError(
            PaymentErrorType.ATTENDANCE_NOT_FOUND,
            "指定された決済レコードが見つかりません"
          );
        }

        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコードの検証に失敗しました: ${error.message}`,
          error
        );
      }

      if (!data) {
        throw new PaymentError(
          PaymentErrorType.ATTENDANCE_NOT_FOUND,
          "指定された決済レコードが見つかりません"
        );
      }
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済レコードの検証中にエラーが発生しました",
        error as Error
      );
    }
  }

  /**
   * ステータス遷移の妥当性を検証
   */
  private async validateStatusTransition(
    paymentId: string,
    newStatus: PaymentStatus
  ): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from("payments")
        .select("status, method")
        .eq("id", paymentId)
        .single();

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `現在のステータス取得に失敗しました: ${error.message}`,
          error
        );
      }

      const currentStatus = data.status as PaymentStatus;
      const method = data.method as PaymentMethod;

      // ステータス遷移ルール
      const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
        pending: ["paid", "received", "failed", "completed", "refunded", "waived"],
        paid: ["completed", "refunded"], // Stripe決済完了後は完了または返金可能
        received: ["completed"], // 現金受領後は完了のみ可能
        failed: ["pending"], // 失敗後は再試行可能
        completed: ["refunded"], // 完了後は返金のみ可能
        refunded: [], // 返金後は変更不可
        waived: ["completed"], // 免除後は完了のみ可能
      };

      if (!validTransitions[currentStatus]?.includes(newStatus)) {
        throw new PaymentError(
          PaymentErrorType.INVALID_PAYMENT_METHOD,
          `ステータス「${currentStatus}」から「${newStatus}」への変更はできません`
        );
      }

      // 決済方法別の制限
      if (method === "stripe" && newStatus === "received") {
        throw new PaymentError(
          PaymentErrorType.INVALID_PAYMENT_METHOD,
          "Stripe決済では「received」ステータスは使用できません"
        );
      }

      if (method === "cash" && newStatus === "paid") {
        throw new PaymentError(
          PaymentErrorType.INVALID_PAYMENT_METHOD,
          "現金決済では「paid」ステータスは使用できません"
        );
      }
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "ステータス遷移の検証中にエラーが発生しました",
        error as Error
      );
    }
  }
}

// バリデーション用のヘルパー関数
export const validateUUID = (value: string, fieldName: string): void => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new PaymentError(
      PaymentErrorType.INVALID_PAYMENT_METHOD,
      `${fieldName}は有効なUUIDである必要があります`
    );
  }
};

export const validateUrl = (value: string, fieldName: string): void => {
  try {
    new URL(value);
  } catch {
    throw new PaymentError(
      PaymentErrorType.INVALID_PAYMENT_METHOD,
      `${fieldName}は有効なURLである必要があります`
    );
  }
};

// Zodスキーマのエクスポート
export {
  createStripeSessionParamsSchema,
  createStripeSessionRequestSchema,
  createCashPaymentParamsSchema,
  updatePaymentStatusParamsSchema,
  paymentMethodSchema,
  paymentStatusSchema,
};
