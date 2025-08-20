/**
 * PayoutError のエラーハンドリングマッピング
 */

import { PayoutErrorType, ErrorHandlingResult } from "./types";

/**
 * エラータイプ別のハンドリング設定
 */
export const ERROR_HANDLING_BY_TYPE: Record<PayoutErrorType, ErrorHandlingResult> = {
  // ユーザーエラー
  [PayoutErrorType.VALIDATION_ERROR]: {
    userMessage: "入力内容に不備があります。内容を確認してください。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },
  [PayoutErrorType.UNAUTHORIZED]: {
    userMessage: "認証が必要です。ログインしてください。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },
  [PayoutErrorType.FORBIDDEN]: {
    userMessage: "この操作を実行する権限がありません。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },

  // ビジネスロジックエラー
  [PayoutErrorType.EVENT_NOT_FOUND]: {
    userMessage: "指定されたイベントが見つかりません。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },
  [PayoutErrorType.EVENT_NOT_ELIGIBLE]: {
    userMessage: "このイベントは送金対象ではありません。イベント終了から5日経過後に送金処理が可能になります。",
    shouldRetry: false,
    logLevel: "info",
    shouldNotifyAdmin: false,
  },
  [PayoutErrorType.PAYOUT_ALREADY_EXISTS]: {
    userMessage: "このイベントの送金処理は既に実行済みです。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },
  [PayoutErrorType.PAYOUT_NOT_FOUND]: {
    userMessage: "指定された送金レコードが見つかりません。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },
  [PayoutErrorType.STRIPE_ACCOUNT_NOT_READY]: {
    userMessage: "Stripe Connectアカウントの設定が完了していません。アカウント設定を完了してください。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },
  [PayoutErrorType.INSUFFICIENT_BALANCE]: {
    userMessage: "送金可能な残高が不足しています。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: true,
  },
  [PayoutErrorType.INVALID_STATUS_TRANSITION]: {
    userMessage: "現在の状態では送金処理を実行できません。",
    shouldRetry: false,
    logLevel: "warn",
    shouldNotifyAdmin: false,
  },

  // システムエラー
  [PayoutErrorType.STRIPE_API_ERROR]: {
    userMessage: "決済システムでエラーが発生しました。しばらく時間をおいてから再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
  [PayoutErrorType.DATABASE_ERROR]: {
    userMessage: "システムエラーが発生しました。管理者にお問い合わせください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
  [PayoutErrorType.CALCULATION_ERROR]: {
    userMessage: "送金金額の計算でエラーが発生しました。管理者にお問い合わせください。",
    shouldRetry: false,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },

  // 外部サービスエラー
  [PayoutErrorType.STRIPE_CONNECT_ERROR]: {
    userMessage: "Stripe Connectでエラーが発生しました。しばらく時間をおいてから再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
  [PayoutErrorType.TRANSFER_CREATION_FAILED]: {
    userMessage: "送金処理の開始に失敗しました。しばらく時間をおいてから再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
  [PayoutErrorType.UPDATE_STATUS_FAILED]: {
    userMessage: "送金ステータスの更新に失敗しました。管理者にお問い合わせください。",
    shouldRetry: true,
    logLevel: "error",
    shouldNotifyAdmin: true,
  },
};

/**
 * Stripeエラーコードから PayoutErrorType へのマッピング
 */
export const STRIPE_ERROR_CODE_MAPPING: Record<string, PayoutErrorType> = {
  // アカウント関連エラー
  "account_invalid": PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
  "account_not_found": PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
  "account_restricted": PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,

  // 残高関連エラー
  "insufficient_funds": PayoutErrorType.INSUFFICIENT_BALANCE,
  "balance_insufficient": PayoutErrorType.INSUFFICIENT_BALANCE,

  // Transfer関連エラー
  "transfer_failed": PayoutErrorType.TRANSFER_CREATION_FAILED,
  "invalid_request_error": PayoutErrorType.VALIDATION_ERROR,

  // API関連エラー
  "api_error": PayoutErrorType.STRIPE_API_ERROR,
  "rate_limit_error": PayoutErrorType.STRIPE_API_ERROR,
  "authentication_error": PayoutErrorType.STRIPE_API_ERROR,
};

/**
 * データベースエラーコードから PayoutErrorType へのマッピング
 */
export const DATABASE_ERROR_CODE_MAPPING: Record<string, PayoutErrorType> = {
  // 一意制約違反
  "23505": PayoutErrorType.PAYOUT_ALREADY_EXISTS,

  // 外部キー制約違反
  "23503": PayoutErrorType.EVENT_NOT_FOUND,

  // NOT NULL制約違反
  "23502": PayoutErrorType.VALIDATION_ERROR,

  // CHECK制約違反
  "23514": PayoutErrorType.VALIDATION_ERROR,
};
