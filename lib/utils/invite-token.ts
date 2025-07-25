import { randomBytes } from "crypto";

/**
 * 招待トークンを生成する
 * - 32文字のランダム文字列
 * - URL安全な文字のみ使用（a-zA-Z0-9_-）
 * - 推測困難性を確保（192ビットのエントロピー）
 */
export function generateInviteToken(): string {
  // 24バイトのランダムデータを生成してbase64urlエンコード
  // base64urlは URL安全で、24バイト = 32文字になる
  // 192ビット（24バイト）のエントロピーで十分な推測困難性を確保
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * 招待トークンの形式をバリデーションする
 */
export function isValidInviteToken(token: string): boolean {
  // 32文字の英数字、ハイフン、アンダースコアのみ
  return /^[a-zA-Z0-9_-]{32}$/.test(token);
}
