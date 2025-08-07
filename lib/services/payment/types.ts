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
  eventTitle: string;
  successUrl: string;
  cancelUrl: string;
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
}

// 決済エラーの種類
export enum PaymentErrorType {
  // ユーザーエラー
  INVALID_PAYMENT_METHOD = "INVALID_PAYMENT_METHOD",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  CARD_DECLINED = "CARD_DECLINED",

  // システムエラー
  STRIPE_API_ERROR = "STRIPE_API_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  WEBHOOK_PROCESSING_ERROR = "WEBHOOK_PROCESSING_ERROR",

  // ビジネスロジックエラー
  PAYMENT_ALREADY_EXISTS = "PAYMENT_ALREADY_EXISTS",
  EVENT_NOT_FOUND = "EVENT_NOT_FOUND",
  ATTENDANCE_NOT_FOUND = "ATTENDANCE_NOT_FOUND",
  INVALID_AMOUNT = "INVALID_AMOUNT",
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
