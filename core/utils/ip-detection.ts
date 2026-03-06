import type { NextRequest } from "next/server";

import { logger } from "@core/logging/app-logger";

/**
 * ヘッダーアクセス用のインターフェース
 */
interface HeaderLike {
  get(name: string): string | null;
}

function hasGetMethod(value: unknown): value is HeaderLike {
  return (
    typeof value === "object" && value !== null && "get" in value && typeof value.get === "function"
  );
}

/**
 * IPアドレス検証用の正規表現
 */
const IPv4_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

function isValidIPv6(ip: string): boolean {
  if (!ip.includes(":")) {
    return false;
  }

  try {
    // WHATWG URL parserにIPv6リテラルとして解釈させて厳格検証する
    // 例: http://[2001:db8::1]
    void new URL(`http://[${ip}]`);
    return true;
  } catch {
    return false;
  }
}

function isValidIP(ip: string): boolean {
  if (!ip || typeof ip !== "string") {
    return false;
  }

  const trimmedIP = ip.trim();

  // 基本的な長さチェック
  if (trimmedIP.length < 2 || trimmedIP.length > 45) {
    return false;
  }

  // IPv4またはIPv6の形式チェック
  return IPv4_REGEX.test(trimmedIP) || isValidIPv6(trimmedIP);
}

function normalizeCandidateIP(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const candidate = raw.split(",")[0]?.trim().toLowerCase();
  if (!candidate) {
    return null;
  }

  return isValidIP(candidate) ? candidate : null;
}

/**
 * クライアントIPアドレスを取得する（Edge Runtime互換版）
 *
 * @param request - Next.js Request オブジェクト
 * @returns クライアントのIPアドレス。取得できない場合はnull
 */
export function getClientIP(request: NextRequest): string | null;
export function getClientIP(headers: HeaderLike): string | null;
export function getClientIP(requestOrHeaders: NextRequest | HeaderLike): string | null {
  // Next.js の ReadonlyHeaders 実装は `.headers` プロパティを内部に持つため、
  // `headers in value` のみで判定すると HeaderLike を誤って NextRequest 扱いしてしまう。
  const headers = hasGetMethod(requestOrHeaders)
    ? requestOrHeaders
    : hasGetMethod(requestOrHeaders.headers)
      ? requestOrHeaders.headers
      : null;

  if (!headers) {
    if (process.env.NODE_ENV !== "test") {
      logger.warn("Unable to resolve client IP because headers-like access is unavailable", {
        category: "system",
        action: "ip_detection_invalid_headers_shape",
        actor_type: "system",
        outcome: "failure",
      });
    }
    return null;
  }

  const rawIp = headers.get("cf-connecting-ip");
  const normalizedIP = normalizeCandidateIP(rawIp);
  if (normalizedIP) {
    return normalizedIP;
  }

  if (process.env.NODE_ENV !== "test") {
    logger.warn("Unable to resolve client IP from CF-Connecting-IP", {
      category: "system",
      action: "ip_detection_missing_or_invalid_cf_ip",
      actor_type: "anonymous",
      has_cf_connecting_ip: !!rawIp,
      raw_cf_connecting_ip: rawIp ?? undefined,
      outcome: "failure",
    });
  }
  return null;
}

/**
 * Server Component/Server Actions用のIPアドレス取得関数
 * Next.js の headers() 関数から取得したオブジェクトに特化
 */
export function getClientIPFromHeaders(headersList: HeaderLike): string | null {
  return getClientIP(headersList);
}
