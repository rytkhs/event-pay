/**
 * 決済データ検証ロジック（feature ルート）
 */

import { z } from "zod";

import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import type { AppSupabaseClient } from "@core/types/supabase";
import { CashUpdateStatusSchema, PaymentStatusSchema } from "@core/validation/payment-status";

import { IPaymentValidator } from "./services/interface";
import {
  CreateStripeSessionParams,
  CreateCashPaymentParams,
  ServiceUpdatePaymentStatusParams,
  PaymentMethod,
  PaymentStatus,
  isPaymentStatus,
} from "./types";

// サービス層（Stripeに渡す直前の最終パラメータ）用スキーマ（内部使用専用）
const createStripeSessionParamsSchema = z.object({
  attendanceId: z.string().uuid("参加記録IDは有効なUUIDである必要があります"),
  amount: z
    .number()
    .int("金額は整数である必要があります")
    .positive("金額は正の数である必要があります"),
  eventTitle: z
    .string()
    .min(1, "イベント名は必須です")
    .max(200, "イベント名は200文字以内である必要があります"),
  successUrl: z.string().url("成功時URLは有効なURLである必要があります"),
  cancelUrl: z.string().url("キャンセル時URLは有効なURLである必要があります"),
  gaClientId: z.string().optional(),
});

// 現金決済用スキーマ（内部使用専用）
const createCashPaymentParamsSchema = z.object({
  attendanceId: z.string().uuid("参加記録IDは有効なUUIDである必要があります"),
  amount: z
    .number()
    .int("金額は整数である必要があります")
    .positive("金額は正の数である必要があります"),
});

// 決済ステータス更新用スキーマ（内部使用専用）
const updatePaymentStatusParamsSchema = z.object({
  paymentId: z.string().uuid("決済IDは有効なUUIDである必要があります"),
  status: PaymentStatusSchema,
  paidAt: z.date().optional(),
  stripePaymentIntentId: z.string().optional(),
});

export const updateCashStatusActionInputSchema = z.object({
  paymentId: z.string().uuid(),
  status: z.enum(["received", "waived", "pending"]),
  notes: z.string().max(1000).optional(),
  isCancel: z.boolean().optional(),
});

export const bulkUpdateCashStatusActionInputSchema = z.object({
  paymentIds: z.array(z.string().uuid()).min(1).max(50), // 最大50件まで
  status: CashUpdateStatusSchema,
  notes: z.string().max(1000).optional(),
});

// Stripeセッション検証用スキーマ（ゲスト用決済画面）
export const verifySessionQuerySchema = z.object({
  session_id: z
    .string({
      required_error: "セッションIDは必須です",
      invalid_type_error: "セッションIDは必須です",
    })
    .min(1, "セッションIDは必須です"),
  attendance_id: z
    .string({
      required_error: "有効な参加IDを入力してください",
      invalid_type_error: "有効な参加IDを入力してください",
    })
    .uuid("有効な参加IDを入力してください"),
});

export type VerifySessionQueryInput = z.infer<typeof verifySessionQuerySchema>;

export class PaymentValidator implements IPaymentValidator {
  private supabase: AppSupabaseClient<"public">;

  constructor(supabaseClient: AppSupabaseClient<"public">) {
    this.supabase = supabaseClient;
  }

  async validateCreateStripeSessionParams(
    params: CreateStripeSessionParams,
    userId: string
  ): Promise<void> {
    try {
      createStripeSessionParamsSchema.parse(params);
      await this.validateAttendanceAccess(params.attendanceId, userId);
      await this.validatePaymentAmount(params.amount);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          `入力検証エラー: ${error.errors.map((e) => e.message).join(", ")}`,
          error
        );
      }
      if (error instanceof PaymentError) throw error;
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "パラメータ検証中にエラーが発生しました",
        error as Error
      );
    }
  }

  async validateCreateCashPaymentParams(
    params: CreateCashPaymentParams,
    userId: string
  ): Promise<void> {
    try {
      createCashPaymentParamsSchema.parse(params);
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
      if (error instanceof PaymentError) throw error;
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "パラメータ検証中にエラーが発生しました",
        error as Error
      );
    }
  }

  async validateUpdatePaymentStatusParams(
    params: ServiceUpdatePaymentStatusParams,
    isCancel?: boolean
  ): Promise<void> {
    try {
      updatePaymentStatusParamsSchema.parse(params);
      await this.validatePaymentExists(params.paymentId);

      // キャンセル操作の場合はステータス遷移チェックをスキップ
      if (!isCancel) {
        await this.validateStatusTransition(params.paymentId, params.status);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          `入力検証エラー: ${error.errors.map((e) => e.message).join(", ")}`,
          error
        );
      }
      if (error instanceof PaymentError) throw error;
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "パラメータ検証中にエラーが発生しました",
        error as Error
      );
    }
  }

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
      if (Array.isArray(data) && data.length > 1) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          "参加記録の整合性エラー: 複数件のレコードが見つかりました"
        );
      }
      if (userId) {
        type EventLite = { id: string; created_by: string };
        type AttendanceQueryResult = {
          id: string;
          event_id: string;
          events: EventLite | EventLite[];
        };

        const record = (Array.isArray(data) ? data[0] : data) as AttendanceQueryResult;
        const events = Array.isArray(record.events) ? record.events : [record.events];
        const createdBy = events[0]?.created_by;
        if (!createdBy || createdBy !== userId) {
          throw new PaymentError(PaymentErrorType.FORBIDDEN, "この操作を実行する権限がありません");
        }
      }
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "参加記録の検証中にエラーが発生しました",
        error as Error
      );
    }
  }

  async validatePaymentAmount(amount: number): Promise<void> {
    if (!Number.isInteger(amount)) {
      throw new PaymentError(PaymentErrorType.INVALID_AMOUNT, "金額は整数である必要があります");
    }
    // issue #123 対応: 負の金額チェックを追加
    if (amount < 0) {
      throw new PaymentError(PaymentErrorType.INVALID_AMOUNT, "金額は0以上である必要があります");
    }
    if (amount <= 0) {
      throw new PaymentError(PaymentErrorType.INVALID_AMOUNT, "金額は正の数である必要があります");
    }
    const MAX_AMOUNT = 1000000;
    if (amount > MAX_AMOUNT) {
      throw new PaymentError(
        PaymentErrorType.INVALID_AMOUNT,
        `金額は${MAX_AMOUNT.toLocaleString()}円以下である必要があります`
      );
    }
    const MIN_AMOUNT = 1;
    if (amount < MIN_AMOUNT) {
      throw new PaymentError(
        PaymentErrorType.INVALID_AMOUNT,
        `金額は${MIN_AMOUNT}円以上である必要があります`
      );
    }
  }

  private async validateNoDuplicatePayment(attendanceId: string): Promise<void> {
    try {
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
      if (error instanceof PaymentError) throw error;
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "重複チェック中にエラーが発生しました",
        error as Error
      );
    }
  }

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
      if (error instanceof PaymentError) throw error;
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済レコードの検証中にエラーが発生しました",
        error as Error
      );
    }
  }

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

      if (!isPaymentStatus(currentStatus)) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `無効な現在のステータス: ${currentStatus}`
        );
      }
      if (!isPaymentStatus(newStatus)) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          `無効な新しいステータス: ${newStatus}`
        );
      }

      // 単調増加（降格禁止）ルール：アプリ側の canPromoteStatus に合わせる
      const { canPromoteStatus } = await import("@core/utils/payments/status-rank");
      const isPromotion = canPromoteStatus(currentStatus, newStatus);

      // 同一ステータスは許容（冪等更新）／降格は拒否
      if (newStatus !== currentStatus && !isPromotion) {
        throw new PaymentError(
          PaymentErrorType.INVALID_STATUS_TRANSITION,
          `ステータス「${currentStatus}」から「${newStatus}」への降格はできません`
        );
      }

      // 方式に応じた禁止ルール
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
      if (error instanceof PaymentError) throw error;
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "ステータス遷移の検証中にエラーが発生しました",
        error as Error
      );
    }
  }
}
