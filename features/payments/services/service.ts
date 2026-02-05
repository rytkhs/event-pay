/**
 * PaymentServiceの基本実装
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPaymentLogger, type PaymentLogger } from "@core/logging/payment-logger";

import { Database } from "@/types/database";

import { createCashPayment as createCashPaymentFn } from "./cash-payment";
import { deletePayment as deletePaymentFn } from "./delete-payment";
import { ApplicationFeeCalculator } from "./fee-config/application-fee-calculator";
import { IPaymentService, IPaymentErrorHandler } from "./interface";
import { getPaymentByAttendance, getPaymentById, getPaymentsByEvent } from "./queries";
import {
  bulkUpdatePaymentStatus as bulkUpdatePaymentStatusFn,
  updatePaymentStatus as updatePaymentStatusFn,
} from "./status-update";
import { createStripeSession as createStripeSessionFn } from "./stripe-session";
import {
  Payment,
  PaymentStatus,
  CreateStripeSessionParams,
  CreateStripeSessionResult,
  CreateCashPaymentParams,
  CreateCashPaymentResult,
  UpdatePaymentStatusParams,
} from "./types";

/**
 * PaymentServiceの実装クラス
 */
export class PaymentService implements IPaymentService {
  private supabase: SupabaseClient<Database, "public">;
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
    this.paymentLogger = createPaymentLogger({ category: "payment", action: "payment_service" });
  }

  /**
   * Stripe決済セッションを作成する
   *
   * 重複作成ガードについて:
   * - 重複検知と一意性の最終責務は本メソッド（Service）に集約する。
   * - 振る舞い（DBの降格禁止ルールに整合）:
   *   - 参加に紐づく既存決済が支払完了系（paid/received/refunded/waived）の場合は
   *     【無条件で】PaymentErrorType.PAYMENT_ALREADY_EXISTS を投げる（重複課金防止）。
   *   - openが pending の場合のみ同レコードを再利用（Stripe識別子のリセットと金額更新）。
   *   - openが failed の場合は新規に pending レコードを作成（failed→pending の降格は行わない）。
   *   - canceled の決済がある場合は無視して新規作成（再参加時のシナリオ）。
   *   - DB一意制約違反（23505）は並行作成とみなし、直近の open を再利用する。
   * - 決済レコードの最新性判定は統一されたeffectiveTime計算ロジックを使用:
   *   - 決済完了状態（paid/received/refunded/waived）: paid_at > updated_at > created_at の優先順位
   *   - 未完了状態（pending/failed/canceled）: updated_at > created_at の優先順位
   * - Action 層では重複チェックを省略してよい（最終判断は本メソッド）。
   */
  async createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult> {
    return createStripeSessionFn(params, {
      supabase: this.supabase,
      paymentLogger: this.paymentLogger,
      applicationFeeCalculator: this.applicationFeeCalculator,
      errorHandler: this.errorHandler,
    });
  }

  /**
   * 現金決済レコードを作成する
   */
  async createCashPayment(params: CreateCashPaymentParams): Promise<CreateCashPaymentResult> {
    return createCashPaymentFn(params, this.supabase);
  }

  /**
   * 決済ステータスを更新する
   */
  async updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void> {
    return updatePaymentStatusFn(params, this.supabase, this.paymentLogger);
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
    return bulkUpdatePaymentStatusFn(updates, userId, this.supabase, this.paymentLogger, notes);
  }

  /**
   * 参加記録IDから決済情報を取得する
   *
   * 注: canceledの決済は返さない（履歴として残るのみで、再参加時は新しい決済を作成するため）
   */
  async getPaymentByAttendance(attendanceId: string): Promise<Payment | null> {
    return getPaymentByAttendance(attendanceId, this.supabase);
  }

  /**
   * 決済IDから決済情報を取得する
   */
  async getPaymentById(paymentId: string): Promise<Payment | null> {
    return getPaymentById(paymentId, this.supabase);
  }

  /**
   * イベントの決済リストを取得する（主催者用）
   */
  async getPaymentsByEvent(eventId: string, userId: string): Promise<Payment[]> {
    return getPaymentsByEvent(eventId, userId, this.supabase);
  }

  /**
   * 決済レコードを削除する
   */
  async deletePayment(paymentId: string): Promise<void> {
    return deletePaymentFn(paymentId, this.supabase);
  }
}
