import * as crypto from "crypto";

import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { headers, type UnsafeUnwrappedHeaders } from "next/headers";

import { getEnv } from "@core/utils/cloudflare-env";

import { LINE_OAUTH_CONFIG } from "./line-constants";

/**
 * リクエストからoriginを構築
 */
export function buildOrigin(): string {
  const env = getEnv();
  const hdrs = headers() as unknown as UnsafeUnwrappedHeaders;
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  return env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`;
}

/**
 * LINE OAuth用Cookie設定を生成
 */
export function createLineOAuthCookieOptions(): Partial<ResponseCookie> {
  const env = getEnv();
  const isProd = env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: LINE_OAUTH_CONFIG.STATE_COOKIE_MAX_AGE,
  };
}

/**
 * PKCE用のcode_verifierを生成
 * RFC7636準拠: 43〜128文字のランダムな文字列
 * 使用可能文字: a-z, A-Z, 0-9, -._~
 */
export function generateCodeVerifier(): string {
  // 43文字（最小値）のランダムな文字列を生成
  // crypto.randomBytes(32)を使用すると、Base64URLエンコード後に43文字になる
  const buffer = crypto.randomBytes(32);
  return base64UrlEncode(buffer.toString("base64"));
}

/**
 * PKCE用のcode_challengeを生成
 * code_verifierをSHA256でハッシュ化し、Base64URL形式にエンコード
 */
export function generateCodeChallenge(codeVerifier: string): string {
  const hash = crypto.createHash("sha256").update(codeVerifier).digest("base64");
  return base64UrlEncode(hash);
}

/**
 * Base64形式の文字列をBase64URL形式に変換
 * - パディング（=）を削除
 * - + を - に置換
 * - / を _ に置換
 */
function base64UrlEncode(str: string): string {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
