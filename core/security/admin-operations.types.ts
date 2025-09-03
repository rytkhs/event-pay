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
