import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { headers } from "next/headers";

import { getEnv } from "@core/utils/cloudflare-env";

import { LINE_OAUTH_CONFIG } from "./line-constants";

/**
 * リクエストからoriginを構築
 */
export function buildOrigin(): string {
  const env = getEnv();
  const hdrs = headers();
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
