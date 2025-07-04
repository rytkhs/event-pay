/**
 * バリデーション・エラーハンドリング関連のユーティリティ
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AsyncValidationError extends ValidationError {
  constructor(
    message: string,
    field?: string,
    public originalError?: Error
  ) {
    super(message, field, "ASYNC_VALIDATION_ERROR");
    this.name = "AsyncValidationError";
  }
}

export const DEFAULT_ERROR_MESSAGES = {
  REQUIRED: "この項目は必須です",
  EMAIL_INVALID: "有効なメールアドレスを入力してください",
  PASSWORD_TOO_SHORT: "パスワードは8文字以上で入力してください",
  PASSWORD_MISMATCH: "パスワードが一致しません",
  VALIDATION_ERROR: "入力値にエラーがあります",
  ASYNC_ERROR: "サーバーでの検証に失敗しました",
  NETWORK_ERROR: "ネットワークエラーが発生しました",
} as const;

export function formatValidationError(
  error: unknown,
  fallbackMessage: string = DEFAULT_ERROR_MESSAGES.VALIDATION_ERROR
): string {
  if (error instanceof ValidationError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallbackMessage;
}

export function isNetworkError(error: unknown): boolean {
  return (
    (error instanceof TypeError && error.message.includes("fetch")) ||
    (error instanceof Error &&
      (error.message.includes("network") || error.message.includes("timeout")))
  );
}

export function createAsyncValidationErrorHandler() {
  return (error: unknown): string => {
    if (isNetworkError(error)) {
      return DEFAULT_ERROR_MESSAGES.NETWORK_ERROR;
    }

    if (error instanceof AsyncValidationError) {
      return error.message;
    }

    return formatValidationError(error, DEFAULT_ERROR_MESSAGES.ASYNC_ERROR);
  };
}
