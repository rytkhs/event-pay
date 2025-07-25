/**
 * Server Actionsの共通レスポンス型定義
 */

export interface ServerActionSuccess<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ServerActionError {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export type ServerActionResult<T = unknown> = ServerActionSuccess<T> | ServerActionError;

/**
 * エラーコード定義
 */
export const ERROR_CODES = {
  // 認証・認可エラー
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // バリデーションエラー
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",

  // データベースエラー
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  DATABASE_ERROR: "DATABASE_ERROR",

  // ビジネスロジックエラー
  BUSINESS_RULE_VIOLATION: "BUSINESS_RULE_VIOLATION",
  EDIT_RESTRICTION: "EDIT_RESTRICTION",

  // システムエラー
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * エラーメッセージのローカライゼーション
 */
export const ERROR_MESSAGES = {
  [ERROR_CODES.UNAUTHORIZED]: "認証が必要です",
  [ERROR_CODES.FORBIDDEN]: "このイベントを編集する権限がありません",
  [ERROR_CODES.VALIDATION_ERROR]: "入力値が無効です",
  [ERROR_CODES.INVALID_INPUT]: "入力形式が正しくありません",
  [ERROR_CODES.NOT_FOUND]: "イベントが見つかりません",
  [ERROR_CODES.CONFLICT]: "データが競合しています",
  [ERROR_CODES.DATABASE_ERROR]: "データベースエラーが発生しました",
  [ERROR_CODES.BUSINESS_RULE_VIOLATION]: "ビジネスルール違反です",
  [ERROR_CODES.EDIT_RESTRICTION]: "編集制限により変更できません",
  [ERROR_CODES.INTERNAL_ERROR]: "システムエラーが発生しました",
  [ERROR_CODES.NETWORK_ERROR]: "ネットワークエラーが発生しました",
} as const;

/**
 * エラーレスポンスを作成するヘルパー関数
 */
export function createErrorResponse(
  code: ErrorCode,
  customMessage?: string,
  details?: Record<string, unknown>
): ServerActionError {
  return {
    success: false,
    error: customMessage || ERROR_MESSAGES[code],
    code,
    details,
  };
}

/**
 * 成功レスポンスを作成するヘルパー関数
 */
export function createSuccessResponse<T>(data: T, message?: string): ServerActionSuccess<T> {
  return {
    success: true,
    data,
    message,
  };
}

/**
 * Zodエラーをレスポンスに変換するヘルパー関数
 */
export function zodErrorToResponse(error: import("zod").ZodError): ServerActionError {
  const firstError = error.errors?.[0];
  return createErrorResponse(
    ERROR_CODES.VALIDATION_ERROR,
    firstError?.message || "入力値が無効です",
    { zodErrors: error.errors }
  );
}
