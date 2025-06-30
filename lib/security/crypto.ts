import { randomBytes, createHash, timingSafeEqual } from "crypto";

/**
 * 暗号学的に安全な乱数生成器を使用してトークンを生成
 * @param length バイト長（デフォルト: 32バイト = 64文字の16進数）
 * @returns 16進数文字列のトークン
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * 6桁の数字OTPコードを生成
 * @returns 6桁の数字文字列
 */
export function generateOtpCode(): string {
  // 暗号学的に安全な乱数で6桁のコードを生成
  const buffer = randomBytes(4);
  const num = buffer.readUInt32BE(0);
  return (num % 1000000).toString().padStart(6, "0");
}

/**
 * トークンのハッシュ化（SHA-256）
 * @param token 元のトークン
 * @returns SHA-256ハッシュ
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 定数時間での文字列比較（タイミング攻撃防止）
 * @param a 比較対象の文字列A
 * @param b 比較対象の文字列B
 * @returns 一致するかどうか
 */
export function constantTimeCompare(a: string, b: string): boolean {
  try {
    // 長さが異なる場合も定数時間で比較するため、同じ長さにパディング
    const maxLength = Math.max(a.length, b.length);
    const bufferA = Buffer.from(a.padEnd(maxLength, "\0"));
    const bufferB = Buffer.from(b.padEnd(maxLength, "\0"));

    return timingSafeEqual(bufferA, bufferB) && a.length === b.length;
  } catch {
    // エラーが発生した場合は必ずfalseを返す
    return false;
  }
}

/**
 * ハッシュ化された値同士の定数時間比較
 * @param inputHash 入力のハッシュ
 * @param storedHash 保存されているハッシュ
 * @returns 一致するかどうか
 */
export function verifyHashedToken(inputToken: string, storedHash: string): boolean {
  const inputHash = hashToken(inputToken);
  return constantTimeCompare(inputHash, storedHash);
}

/**
 * OTPコードの定数時間比較（6桁数字専用）
 * @param inputOtp 入力されたOTPコード
 * @param storedOtp 保存されているOTPコード
 * @returns 一致するかどうか
 */
export function verifyOtpCode(inputOtp: string, storedOtp: string): boolean {
  // 6桁の数字のみ許可
  const otpPattern = /^\d{6}$/;
  if (!otpPattern.test(inputOtp) || !otpPattern.test(storedOtp)) {
    return false;
  }

  return constantTimeCompare(inputOtp, storedOtp);
}

/**
 * ランダムな遅延を追加（タイミング正規化）
 * @param minMs 最小遅延時間（ミリ秒）
 * @param maxMs 最大遅延時間（ミリ秒）
 */
export async function randomDelay(minMs: number = 100, maxMs: number = 500): Promise<void> {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * セキュアなランダム整数生成
 * @param min 最小値（含む）
 * @param max 最大値（含む）
 * @returns セキュアなランダム整数
 */
export function secureRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  const byteCount = Math.ceil(Math.log2(range) / 8);
  const maxValid = Math.floor(256 ** byteCount / range) * range - 1;

  let randomValue;
  do {
    const buffer = randomBytes(byteCount);
    randomValue = buffer.readUIntBE(0, byteCount);
  } while (randomValue > maxValid);

  return min + (randomValue % range);
}

/**
 * CSPRNGベースのUUID v4生成
 * @returns UUID v4文字列
 */
export function generateSecureUuid(): string {
  const bytes = randomBytes(16);

  // バージョン4を設定
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // バリアント2を設定
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join("-");
}

/**
 * テスト用のヘルパー関数
 */
export const __testing__ = {
  constantTimeCompare,
  verifyOtpCode,
  hashToken,
};
