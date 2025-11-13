/**
 * Stripe Connectアカウントステータス同期の型定義
 * エラーハンドリング、リトライ、レート制限に関する型定義
 */

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
  error?: Error;
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
