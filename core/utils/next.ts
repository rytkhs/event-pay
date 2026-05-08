import { handleServerError } from "@core/utils/error-handler.server";
import { toErrorLike } from "@core/utils/type-guards";

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
    return message.startsWith("NEXT_REDIRECT");
  } catch {
    return false;
  }
}

/**
 * Next.js ナビゲーション（redirect/notFound等）が投げる制御例外の検知ユーティリティ
 */
export function isNextNavigationError(err: unknown): boolean {
  try {
    const digest = toErrorLike(err).digest;
    if (
      typeof digest === "string" &&
      (digest.startsWith("NEXT_REDIRECT") ||
        digest.startsWith("NEXT_NOT_FOUND") ||
        digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
    ) {
      return true;
    }
    const message = err instanceof Error ? err.message : String(err);
    return (
      message.startsWith("NEXT_REDIRECT") ||
      message.startsWith("NEXT_NOT_FOUND") ||
      message.startsWith("NEXT_HTTP_ERROR_FALLBACK")
    );
  } catch {
    return false;
  }
}

/**
 * Next.js headers() を利用できるリクエスト文脈でのみヘッダー情報を取得する。
 * 利用できない場合はフォールバックせず例外を投げる。
 */
export async function getHeaders(): Promise<{
  headersList: { get: (name: string) => string | null };
  context: { userAgent?: string; ip?: string };
}> {
  try {
    // next/headers から headers() を動的にインポート
    const { headers } = await import("next/headers");
    const headersList = await headers();

    if (headersList) {
      const userAgent = headersList.get("user-agent") ?? undefined;
      const ip = getClientIPFromHeaders(headersList) ?? undefined;
      return { headersList, context: { userAgent, ip } };
    }

    throw new Error("headers() returned null");
  } catch (error) {
    const message = "getHeaders requires next/headers headers() in a server request context.";

    handleServerError("INTERNAL_ERROR", {
      category: "system",
      action: "header_access",
      actorType: "system",
      additionalData: {
        reason: "NEXT_HEADERS_UNAVAILABLE",
        error_message: error instanceof Error ? error.message : String(error),
        environment: process.env.NODE_ENV,
      },
    });

    throw new Error(message);
  }
}
