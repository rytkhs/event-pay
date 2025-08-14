/**
 * 決済データ検証ロジック
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  private supabase: SupabaseClient<Database>;

  constructor(supabaseClient: SupabaseClient<Database>) {
    this.supabase = supabaseClient;
  }

  /**
   * Stripe決済セッション作成パラメータを検証する
   */
  async validateCreateStripeSessionParams(params: CreateStripeSessionParams, userId: string): Promise<void> {
    try {
      // Zodスキーマによる基本検証
      createStripeSessionParamsSchema.parse(params);

      // ビジネスルール検証
      await this.validateAttendanceAccess(params.attendanceId, userId);
      await this.validatePaymentAmount(params.amount);
      // 注意: 重複作成ガードの最終責務は PaymentService.createStripeSession に集約する。
      // ここでは重複チェックは行わない（pending/failed の再利用を阻害しないため）。
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
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
  async validateCreateCashPaymentParams(params: CreateCashPaymentParams, userId: string): Promise<void> {
    try {
      // Zodスキーマによる基本検証
      createCashPaymentParamsSchema.parse(params);

      // ビジネスルール検証
      await this.validateAttendanceAccess(params.attendanceId, userId);
      await this.validatePaymentAmount(params.amount);
      await this.validateNoDuplicatePayment(params.attendanceId);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
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
          PaymentErrorType.VALIDATION_ERROR,
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
  async validateAttendanceAccess(attendanceId: string, userId: string): Promise<void> {
    try {
      const baseQuery = this.supabase
        .from("attendances")
        .select("id, event_id, events!inner(id, created_by)")
        .eq("id", attendanceId)
        .limit(2);

      const { data, error } = await baseQuery;

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `参加記録の検証に失敗しました: ${error.message}`,
          error
        );
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new PaymentError(
          PaymentErrorType.ATTENDANCE_NOT_FOUND,
          "指定された参加記録が見つかりません"
        );
      }

      // 複数件ヒットはデータ不整合
      if (Array.isArray(data) && data.length > 1) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          "参加記録の整合性エラー: 複数件のレコードが見つかりました"
        );
      }

      // userId は必須引数。created_by を確認
      if (userId) {
        type EventLite = { id: string; created_by: string };
        type AttendanceWithEvent = { id: string; event_id: string; events: EventLite | EventLite[] };
        const record = (Array.isArray(data) ? data[0] : data) as unknown as AttendanceWithEvent;
        const events = Array.isArray(record.events) ? record.events : [record.events];
        const createdBy = events[0]?.created_by;
        if (!createdBy || createdBy !== userId) {
          throw new PaymentError(
            PaymentErrorType.FORBIDDEN,
            "この操作を実行する権限がありません"
          );
        }
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
      // .single() は 0件/複数件で例外が分かれるため、limit(1) で存在のみ判定
      const { data, error } = await this.supabase
        .from("payments")
        .select("id")
        .eq("attendance_id", attendanceId)
        .limit(1);

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `重複チェック中にエラーが発生しました: ${error.message}`,
          error
        );
      }

      if (Array.isArray(data) && data.length > 0) {
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
        .maybeSingle();

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコードの検証に失敗しました: ${error.message}`,
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
          PaymentErrorType.INVALID_STATUS_TRANSITION,
          `ステータス「${currentStatus}」から「${newStatus}」への変更はできません`
        );
      }

      // 決済方法別の制限
      if (method === "stripe" && newStatus === "received") {
        throw new PaymentError(
          PaymentErrorType.INVALID_STATUS_TRANSITION,
          "Stripe決済では「received」ステータスは使用できません"
        );
      }

      if (method === "cash" && newStatus === "paid") {
        throw new PaymentError(
          PaymentErrorType.INVALID_STATUS_TRANSITION,
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
      PaymentErrorType.VALIDATION_ERROR,
      `${fieldName}は有効なUUIDである必要があります`
    );
  }
};

export const validateUrl = (value: string, fieldName: string): void => {
  try {
    new URL(value);
  } catch {
    throw new PaymentError(
      PaymentErrorType.VALIDATION_ERROR,
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
