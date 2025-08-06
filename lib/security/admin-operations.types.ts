/**
 * 管理者操作の結果型定義
 */
export interface AdminOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  auditId?: string;
  timestamp: Date;
}

/**
 * 管理者操作のコンテキスト型定義
 */
export interface AdminOperationContext {
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  operationType: string;
  reason: string;
  additionalContext?: Record<string, unknown>;
}
