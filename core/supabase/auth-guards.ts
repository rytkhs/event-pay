import { AuthError, isAuthApiError } from "@supabase/supabase-js";

/**
 * AuthErrorのmessageプロパティを安全に取得
 */
export function getAuthErrorMessage(error: unknown): string | undefined {
  if (isAuthApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message: unknown }).message;
    return typeof msg === "string" ? msg : undefined;
  }
  return undefined;
}

/**
 * AuthErrorが特定のエラーコードを持つかチェック
 * @see https://supabase.com/docs/guides/auth/debugging/error-codes
 */
export function hasAuthErrorCode(error: unknown, code: string): boolean {
  if (isAuthApiError(error)) {
    return error.code === code;
  }
  return false;
}

/**
 * resetPasswordForEmailの戻り値型ガード
 */
export function isResetPasswordResult(value: unknown): value is {
  data: unknown;
  error: AuthError | null;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // dataとerrorの両方のキーが存在することを確認
  if (!("data" in obj && "error" in obj)) {
    return false;
  }

  // errorがnullなら成功パターンとして有効
  if (obj.error === null) {
    return true;
  }

  // errorがnull以外なら、オブジェクトでありmessageプロパティ（AuthErrorの最小要件）を持つか確認
  return (
    typeof obj.error === "object" &&
    obj.error !== null &&
    "message" in obj.error &&
    typeof (obj.error as { message: unknown }).message === "string"
  );
}
