/**
 * Web Crypto API使用の暗号学的に安全なランダムバイト生成
 * Edge runtimeとNode.js両方で動作
 * @param length バイト長
 * @returns Uint8Array
 */
export function generateRandomBytes(length: number): Uint8Array {
  // Web Crypto APIが利用可能かチェック (Node.js 18+ / Browser / Edge)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  throw new Error("No secure random number generator available");
}

/**
 * バイト配列をBase64URL安全な文字列に変換
 * @param bytes Uint8Array
 * @returns URL安全なBase64文字列
 */
export function toBase64UrlSafe(bytes: Uint8Array): string {
  // Base64エンコード
  const base64 = btoa(String.fromCharCode(...bytes));

  // URL安全な形式に変換
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * トークンのハッシュ化（SHA-256）
 * @param token 元のトークン
 * @returns SHA-256ハッシュ
 */
export async function hashToken(token: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * CSPRNGベースのUUID v4生成
 * @returns UUID v4文字列
 */
export function generateSecureUuid(): string {
  const bytes = generateRandomBytes(16);

  // バージョン4を設定
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // バリアント2を設定
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join("-");
}

/**
 * ゲストトークンの基本フォーマットを検証
 * @param token 検証するトークン
 * @returns フォーマットが有効かどうか
 */
export function validateGuestTokenFormat(token: string): boolean {
  // 36文字のプレフィックス付きBase64URL形式をチェック（gst_プレフィックス + 32文字）
  return /^gst_[a-zA-Z0-9_-]{32}$/.test(token);
}
