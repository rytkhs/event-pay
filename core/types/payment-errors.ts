/**
 * 決済エラー関連の共通型定義
 * core層とfeatures層で共有する決済エラー型
 */

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

  // Stripe Connect関連エラー
  CONNECT_ACCOUNT_NOT_FOUND = "CONNECT_ACCOUNT_NOT_FOUND",
  CONNECT_ACCOUNT_RESTRICTED = "CONNECT_ACCOUNT_RESTRICTED",
  STRIPE_CONFIG_ERROR = "STRIPE_CONFIG_ERROR",

  // 汎用エラー（Ports/Legacy互換）
  NOT_FOUND = "NOT_FOUND",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

// 決済エラークラス
export class PaymentError extends Error {
  constructor(
    public type: PaymentErrorType,
    message: string,
    public cause?: unknown
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
