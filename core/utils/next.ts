import { logger } from "@core/logging/app-logger";
import { toErrorLike } from "@core/utils/type-guards";

import { getEnv } from "./cloudflare-env";
import { getClientIPFromHeaders } from "./ip-detection";

/**
 * Next.js ナビゲーション（redirect等）が投げる制御例外の検知ユーティリティ
 *
 * 現行のNext.jsでは `error.digest` に "NEXT_REDIRECT" で始まる文字列が格納される。
 * まれに `message === "NEXT_REDIRECT"` の形で来るケースへのフォールバックも保持。
 */
export function isNextRedirectError(err: unknown): boolean {
  try {
    const digest = toErrorLike(err).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return true;
    }
    const message = err instanceof Error ? err.message : String(err);
    return message === "NEXT_REDIRECT";
  } catch {
    return false;
  }
}

/**
 * テスト環境でも安全にNext.js headers()を呼び出すためのヘルパー関数
 *
 * @param fallbackContext テスト環境等でheaders()が利用できない場合のフォールバック値
 * @returns ヘッダー情報またはフォールバック値
 */
export async function getSafeHeaders(fallbackContext?: {
  userAgent?: string;
  ip?: string;
}): Promise<{
  headersList: { get: (name: string) => string | null } | null;
  context: { userAgent?: string; ip?: string };
}> {
  let headersList: { get: (name: string) => string | null } | null = null;
  let context: { userAgent?: string; ip?: string };

  try {
    // next/headersから動的にheaders()をインポート（ESModules対応）
    const { headers } = await import("next/headers");
    headersList = await headers();

    if (headersList) {
      // 実際のヘッダーから情報を抽出
      const userAgent = headersList.get("user-agent") ?? undefined;
      const ip = getClientIPFromHeaders(headersList);
      context = { userAgent, ip };
    } else {
      throw new Error("headers() returned null");
    }
  } catch (error) {
    // headers()が利用できない場合（テスト環境など）
    logger.warn("next/headers not available, using fallback context", {
      category: "system",
      action: "header_access",
      actor_type: "system",
      error_message: error instanceof Error ? error.message : String(error),
      environment: getEnv().NODE_ENV,
      fallback: fallbackContext ? "provided" : "default",
      outcome: "failure",
    });

    // headersList を null に設定
    headersList = null;

    // フォールバック値を使用
    context = fallbackContext || {
      userAgent: getEnv().NODE_ENV === "test" ? "test-environment" : "unknown",
      ip: "127.0.0.1",
    };
  }

  return { headersList, context };
}
