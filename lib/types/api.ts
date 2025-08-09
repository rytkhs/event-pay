// API レスポンスの共通型定義

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message?: string;
  data?: T;
}

export interface ApiErrorResponse {
  success: false;
  error:
  | string
  | {
    code: string;
    message: string;
  };
  details?: Record<string, string>;
  retryAfter?: number;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * APIエラーレスポンスから安全にエラーメッセージを取得する
 * @param error APIエラーレスポンスのerrorプロパティ
 * @param fallback フォールバックメッセージ
 * @returns エラーメッセージ
 */
export function getErrorMessage(
  error: ApiErrorResponse["error"],
  fallback: string = "処理に失敗しました"
): string {
  if (typeof error === "string") {
    return error;
  }
  return error?.message || fallback;
}

// ====================================================================
// Payments: create-cash 専用レスポンス型（0円時の成功も型で表現）
// ====================================================================

export type CreateCashPaymentResponse =
  | ApiSuccessResponse<{ paymentId: string }>
  | ApiSuccessResponse<{ noPaymentRequired: true; paymentId: null }>
  | ApiErrorResponse;
