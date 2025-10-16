/**
 * StripeConnect エラーマッピング設定
 */

import { StripeConnectErrorType, ErrorHandlingResult } from "./types";

/**
 * エラータイプ別のハンドリング設定
 */
export const ERROR_HANDLING_BY_TYPE: Record<StripeConnectErrorType, ErrorHandlingResult> = {
  // ユーザーエラー
  [StripeConnectErrorType.ACCOUNT_ALREADY_EXISTS]: {
    userMessage: "既にStripeアカウントが存在します。",
    shouldRetry: false,
    logLevel: "info",
    shouldNotifyAdmin: false,
  },
  [StripeConnectErrorType.ACCOUNT_NOT_FOUND]: {
    userMessage: "Stripeアカウントが見つかりません。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },
  [StripeConnectErrorType.INVALID_ACCOUNT_STATUS]: {
    userMessage: "アカウントの状態が無効です。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },
  [StripeConnectErrorType.ONBOARDING_INCOMPLETE]: {
    userMessage: "アカウントの設定が完了していません。オンボーディングを完了してください。",
    shouldRetry: false,
    logLevel: "info",
    shouldNotifyAdmin: false,
  },

  // Stripe APIエラー
  [StripeConnectErrorType.STRIPE_API_ERROR]: {
    userMessage:
      "決済サービスとの通信でエラーが発生しました。しばらく時間をおいて再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
  [StripeConnectErrorType.ACCOUNT_CREATION_FAILED]: {
    userMessage: "アカウントの作成に失敗しました。しばらく時間をおいて再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
  [StripeConnectErrorType.ACCOUNT_LINK_CREATION_FAILED]: {
    userMessage:
      "アカウント設定リンクの生成に失敗しました。しばらく時間をおいて再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
  [StripeConnectErrorType.ACCOUNT_RETRIEVAL_FAILED]: {
    userMessage: "アカウント情報の取得に失敗しました。しばらく時間をおいて再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },

  // システムエラー
  [StripeConnectErrorType.DATABASE_ERROR]: {
    userMessage: "システムエラーが発生しました。しばらく時間をおいて再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
  [StripeConnectErrorType.VALIDATION_ERROR]: {
    userMessage: "入力内容に問題があります。入力内容を確認してください。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },
  [StripeConnectErrorType.UNKNOWN_ERROR]: {
    userMessage: "予期しないエラーが発生しました。しばらく時間をおいて再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
};

/**
 * Stripe APIエラーコード別のマッピング
 */
export const STRIPE_ERROR_CODE_MAPPING: Record<string, StripeConnectErrorType> = {
  // アカウント関連
  account_already_exists: StripeConnectErrorType.ACCOUNT_ALREADY_EXISTS,
  account_invalid: StripeConnectErrorType.INVALID_ACCOUNT_STATUS,
  account_not_found: StripeConnectErrorType.ACCOUNT_NOT_FOUND,

  // API関連
  api_connection_error: StripeConnectErrorType.STRIPE_API_ERROR,
  api_error: StripeConnectErrorType.STRIPE_API_ERROR,
  authentication_error: StripeConnectErrorType.STRIPE_API_ERROR,
  rate_limit_error: StripeConnectErrorType.STRIPE_API_ERROR,

  // パラメータ関連
  invalid_request_error: StripeConnectErrorType.VALIDATION_ERROR,
  idempotency_key_in_use: StripeConnectErrorType.VALIDATION_ERROR,
};

/**
 * PostgreSQLエラーコード別のマッピング
 */
export const POSTGRES_ERROR_CODE_MAPPING: Record<string, StripeConnectErrorType> = {
  // 一意制約違反
  "23505": StripeConnectErrorType.ACCOUNT_ALREADY_EXISTS,

  // 外部キー制約違反
  "23503": StripeConnectErrorType.VALIDATION_ERROR,

  // NOT NULL制約違反
  "23502": StripeConnectErrorType.VALIDATION_ERROR,

  // チェック制約違反
  "23514": StripeConnectErrorType.VALIDATION_ERROR,

  // 接続エラー
  "08000": StripeConnectErrorType.DATABASE_ERROR,
  "08003": StripeConnectErrorType.DATABASE_ERROR,
  "08006": StripeConnectErrorType.DATABASE_ERROR,

  // 権限エラー
  "42501": StripeConnectErrorType.DATABASE_ERROR,
};
