// API レスポンス型定義

/**
 * API エラー情報
 */
export interface ApiError {
  /** エラーコード */
  code: string;
  /** エラーメッセージ */
  message: string;
  /** 追加の詳細情報（省略可能） */
  details?: Record<string, unknown>;
}

/**
 * 標準 API レスポンス型
 */
export interface ApiResponse<T = unknown> {
  /** 処理成功フラグ */
  success: boolean;
  /** レスポンスデータ（成功時） */
  data?: T;
  /** エラー情報（失敗時） */
  error?: ApiError;
}

/**
 * Cron API の実行結果データ型
 */
export interface CronExecutionData {
  /** 処理メッセージ */
  message: string;
  /** 更新されたイベント数 */
  updatesCount: number;
  /** スキップされたイベント数 */
  skippedCount?: number;
  /** 具体的な更新内容 */
  updates?: Array<{
    id: string;
    oldStatus: string;
    newStatus: string;
    reason: string;
  }>;
  /** 処理時間（ミリ秒） */
  processingTime: number;
}