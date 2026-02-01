import { cache } from "react";

import { headers } from "next/headers";
/* no-op */
import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { logInvalidTokenAccess, logUnexpectedGuestPageError } from "@core/security/security-logger";
import { validateGuestToken } from "@core/utils/guest-token";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { sanitizeForEventPay } from "@core/utils/sanitize";

import { GuestPageClient } from "./GuestPageClient";

/* no-op */

// リクエスト内で検証結果を共有し、DB クエリを 1 回に抑える
const getGuestValidation = cache(async (token: string) => validateGuestToken(token));

interface GuestPageProps {
  params: { token: string };
  searchParams: { payment?: string; session_id?: string };
}

export async function generateMetadata({ params }: GuestPageProps): Promise<Metadata> {
  const { token } = params;

  // ゲストトークンを検証してイベント情報を取得
  const validation = await getGuestValidation(token);

  if (!validation.isValid || !validation.attendance) {
    return {
      title: "ゲストページ",
      robots: "noindex, nofollow",
      referrer: "no-referrer",
    };
  }

  const eventTitle = sanitizeForEventPay(validation.attendance.event.title);

  return {
    title: `${eventTitle} - ゲストページ`,
    robots: "noindex, nofollow",
    referrer: "no-referrer",
  };
}

export default async function GuestPage({ params, searchParams }: GuestPageProps) {
  const { token } = params;
  const { payment: paymentParam, session_id } = searchParams;
  const VALID_PAYMENT_STATUSES = new Set([
    "success",
    "canceled",
    "failed",
    "processing",
    "pending",
  ]);
  const payment = VALID_PAYMENT_STATUSES.has(paymentParam ?? "") ? paymentParam : undefined;

  try {
    // リクエスト情報を取得（セキュリティログ用）
    const headersList = headers();
    const userAgent = headersList.get("user-agent") || undefined;
    const ip = getClientIPFromHeaders(headersList);

    // ゲストトークンの検証
    const validation = await getGuestValidation(token);

    // 無効なトークンの場合は404を返す
    if (!validation.isValid || !validation.attendance) {
      // 無効なゲストトークンアクセスをログに記録
      logInvalidTokenAccess(token, "guest", { userAgent, ip });
      notFound();
    }

    const { attendance, canModify } = validation;

    return (
      <div className="min-h-screen bg-muted/20">
        {/* メインコンテンツ */}
        <main
          className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8"
          aria-labelledby="page-title"
        >
          <GuestPageClient
            attendance={attendance}
            canModify={canModify}
            payment={payment}
            sessionId={session_id}
            guestToken={token}
          />
        </main>
      </div>
    );
  } catch (error) {
    // 予期しないエラーの場合は構造化ログを記録して404を返す
    const { logError } = await import("@core/utils/error-handler.server");
    const { AppError } = await import("@core/errors");

    // リクエスト情報を取得（エラーハンドリング用）
    const errorHeadersList = headers();
    const errorUserAgent = errorHeadersList.get("user-agent") || undefined;
    const errorIp = getClientIPFromHeaders(errorHeadersList);

    const errorContext = {
      action: "guest_page_load",
      ip: errorIp,
      userAgent: errorUserAgent,
      additionalData: {
        tokenPrefix: `${token.substring(0, 8)}...`,
        originalError: error instanceof Error ? error.name : "Unknown",
        originalMessage: error instanceof Error ? error.message : String(error),
      },
    };

    logError(new AppError("GUEST_TOKEN_VALIDATION_FAILED"), errorContext);

    // セキュリティログに記録（エラー詳細は記録しない）
    logUnexpectedGuestPageError(token, error, { userAgent: errorUserAgent, ip: errorIp });
    notFound();
  }
}
