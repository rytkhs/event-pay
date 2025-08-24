/**
 * 決済サービス関連の型定義
 */

import { Database } from "@/types/database";

// 決済方法の型（データベースのenumに合わせる）
export type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];

// 決済ステータスの型（データベースのenumに合わせる）
export type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];

// 決済レコードの型（データベーススキーマに合わせる）
export interface Payment {
  id: string;
  attendance_id: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  stripe_payment_intent_id?: string | null;
  webhook_event_id?: string | null;
  webhook_processed_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

// Stripe決済セッション作成パラメータ
export interface CreateStripeSessionParams {
  attendanceId: string;
  amount: number;
  /**
   * 決済対象イベントID（idempotency_key生成に使用）
   */
  eventId: string;
  /**
   * 決済を実行するユーザーID（idempotency_key生成に使用）
   */
  userId: string;
  eventTitle: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * Strip でのグルーピング用識別子
   * - Checkout -> PaymentIntent に付与し、のちの Transfer と突合するために使用
   */
  transferGroup?: string;
  /**
   * Destination charges用パラメータ
   */
  destinationCharges?: {
    /** 送金先のStripe Connect アカウントID (acct_...) */
    destinationAccountId: string;
    /** ユーザーのメールアドレス（Customer作成用） */
    userEmail?: string;
    /** ユーザー名（Customer作成用） */
    userName?: string;
    /**
     * Checkout Session で将来のオフセッション決済用にカード情報を保存するかどうか
     * @see https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-payment_intent_data-setup_future_usage
     */
    setupFutureUsage?: 'off_session';
  };
}

// Stripe決済セッション作成結果
export interface CreateStripeSessionResult {
  sessionUrl: string;
  sessionId: string;
}

// 現金決済作成パラメータ
export interface CreateCashPaymentParams {
  attendanceId: string;
  amount: number;
}

// 現金決済作成結果
export interface CreateCashPaymentResult {
  paymentId: string;
}

// 決済ステータス更新パラメータ
export interface UpdatePaymentStatusParams {
  paymentId: string;
  status: PaymentStatus;
  paidAt?: Date;
  stripePaymentIntentId?: string;
  expectedVersion?: number; // 楽観的ロック用
  userId?: string; // RPC実行用ユーザーID
  notes?: string; // 更新理由・備考
}

// 決済エラーの種類
export enum PaymentErrorType {
  // ユーザーエラー
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_PAYMENT_METHOD = "INVALID_PAYMENT_METHOD",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  CARD_DECLINED = "CARD_DECLINED",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",

  // システムエラー
  STRIPE_API_ERROR = "STRIPE_API_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  WEBHOOK_PROCESSING_ERROR = "WEBHOOK_PROCESSING_ERROR",

  // ビジネスロジックエラー
  INVALID_STATUS_TRANSITION = "INVALID_STATUS_TRANSITION",
  PAYMENT_ALREADY_EXISTS = "PAYMENT_ALREADY_EXISTS",
  EVENT_NOT_FOUND = "EVENT_NOT_FOUND",
  ATTENDANCE_NOT_FOUND = "ATTENDANCE_NOT_FOUND",
  PAYMENT_NOT_FOUND = "PAYMENT_NOT_FOUND",
  INVALID_AMOUNT = "INVALID_AMOUNT",
  CONCURRENT_UPDATE = "CONCURRENT_UPDATE", // 楽観的ロック競合
}

// 決済エラークラス
export class PaymentError extends Error {
  constructor(
    public type: PaymentErrorType,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

// エラーハンドリング結果
export interface ErrorHandlingResult {
  userMessage: string;
  shouldRetry: boolean;
  logLevel: "info" | "warn" | "error";
}
