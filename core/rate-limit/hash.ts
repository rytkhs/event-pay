import { createHmac } from "crypto";

const HMAC_SECRET = process.env.RL_HMAC_SECRET || "dev-rl-hmac-secret";

export function hmacSha256Hex(value: string): string {
  return createHmac("sha256", HMAC_SECRET).update(value).digest("hex");
}

// メールやトークンなどPIIはそのまま使わずHMACの先頭16文字に短縮
export function protectIdentifier(identifier: string): string {
  return hmacSha256Hex(identifier).slice(0, 16);
}

export function shortTokenHint(token: string): string {
  // ログ用の短縮表示（先頭6 + ... + 末尾4）
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
