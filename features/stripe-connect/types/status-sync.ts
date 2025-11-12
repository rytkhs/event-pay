/**
 * Stripe Connectアカウントステータス同期の型定義
 * エラーハンドリング、リトライ、レート制限に関する型定義
 */

/**
 * Status Sync Error Type
 * ステータス同期エラーの分類
 */
export enum StatusSyncErrorType {
  /** Stripe APIエラー */
  STRIPE_API_ERROR = "STRIPE_API_ERROR",
  /** ネットワークエラー */
  NETWORK_ERROR = "NETWORK_ERROR",
  /** レート制限エラー */
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
  /** データベースエラー */
  DATABASE_ERROR = "DATABASE_ERROR",
  /** バリデーションエラー */
  VALIDATION_ERROR = "VALIDATION_ERROR",
}

/**
 * Status Sync Error
 * ステータス同期エラークラス
 */
export class StatusSyncError extends Error {
  constructor(
    public type: StatusSyncErrorType,
    message: string,
    public retryable: boolean,
    public originalError?: Error
  ) {
    super(message);
    this.name = "StatusSyncError";
  }
}

/**
 * Status Sync Options
 * ステータス同期のオプション
 */
export interface StatusSyncOptions {
  /** 最大リトライ回数 */
  maxRetries?: number;
  /** 初期バックオフ時間（ミリ秒） */
  initialBackoffMs?: number;
  /** バックオフ倍率 */
  backoffMultiplier?: number;
  /** タイムアウト時間（ミリ秒） */
  timeoutMs?: number;
}

/**
 * Status Sync Result
 * ステータス同期の結果
 */
export interface StatusSyncResult {
  /** 同期が成功したか */
  success: boolean;
  /** 試行回数 */
  attempts: number;
  /** エラー情報（失敗時） */
  error?: StatusSyncError;
  /** 同期にかかった時間（ミリ秒） */
  durationMs: number;
}

/**
 * Rate Limit Config
 * レート制限の設定
 */
export interface RateLimitConfig {
  /** 時間窓（秒） */
  windowSeconds: number;
  /** 最大リクエスト数 */
  maxRequests: number;
}

/**
 * Rate Limit Result
 * レート制限チェックの結果
 */
export interface RateLimitResult {
  /** リクエストが許可されたか */
  allowed: boolean;
  /** 残りリクエスト数 */
  remaining: number;
  /** リセットまでの時間（秒） */
  resetInSeconds: number;
}

/**
 * Status Change Log
 * ステータス変更の監査ログ
 */
export interface StatusChangeLog {
  /** タイムスタンプ */
  timestamp: string;
  /** ユーザーID */
  user_id: string;
  /** Stripe Account ID */
  stripe_account_id: string;
  /** 変更前のステータス */
  previous_status: string | null;
  /** 変更後のステータス */
  new_status: string;
  /** トリガー */
  trigger: "webhook" | "ondemand" | "manual";
  /** 分類メタデータ */
  classification_metadata: {
    gate: 1 | 2 | 3 | 4 | 5;
    details_submitted: boolean;
    payouts_enabled: boolean;
    transfers_active: boolean;
    card_payments_active: boolean;
    has_due_requirements: boolean;
    disabled_reason?: string;
  };
}

/**
 * Webhook Event Type
 * 処理対象のWebhookイベントタイプ
 */
export type WebhookEventType = "account.updated";

/**
 * Webhook Processing Result
 * Webhook処理の結果
 */
export interface WebhookProcessingResult {
  /** 処理が成功したか */
  processed: boolean;
  /** スキップされたか */
  skipped?: boolean;
  /** エラー情報（失敗時） */
  error?: string;
}
