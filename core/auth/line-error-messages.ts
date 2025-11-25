/**
 * LINE Login エラーコードとユーザー向けメッセージのマッピング
 */

import { LINE_ERROR_CODES } from "./line-constants";

export const LINE_ERROR_MESSAGES: Record<string, string> = {
  [LINE_ERROR_CODES.EMAIL_REQUIRED]:
    "メールアドレスが取得できませんでした。ログインをやり直してメールアドレスの提供を許可してください。",
  [LINE_ERROR_CODES.AUTH_FAILED]: "LINE認証に失敗しました。もう一度お試しください。",
  [LINE_ERROR_CODES.STATE_MISMATCH]: "セキュリティ検証に失敗しました。もう一度お試しください。",
  [LINE_ERROR_CODES.TOKEN_FAILED]: "LINE認証トークンの取得に失敗しました。もう一度お試しください。",
  [LINE_ERROR_CODES.SERVER_ERROR]:
    "サーバーエラーが発生しました。しばらく時間をおいてから再度お試しください。",
  [LINE_ERROR_CODES.CONFIG_ERROR]:
    "ログインに失敗しました。しばらく時間をおいてから再度お試しください。",
};
