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
   * 決済実行主体のID（idempotency_key生成に使用）
   * - 認証ユーザー: users.id
   * - ゲスト: attendances.id（参加単位）
   */
  actorId: string;
  eventTitle: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * GA4 Client ID（アナリティクス追跡用）
   */
  gaClientId?: string;
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
    setupFutureUsage?: "off_session";
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
