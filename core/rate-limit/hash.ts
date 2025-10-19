import { createHmac } from "crypto";

import { getEnv } from "@core/utils/cloudflare-env";

let cachedHmacSecret: string;

function getHmacSecret(): string {
  if (!cachedHmacSecret) {
    const env = getEnv();
    cachedHmacSecret = env.RL_HMAC_SECRET || "dev-rl-hmac-secret";
  }
  return cachedHmacSecret;
}

export function hmacSha256Hex(value: string): string {
  return createHmac("sha256", getHmacSecret()).update(value).digest("hex");
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
