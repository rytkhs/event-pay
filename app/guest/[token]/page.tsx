import { cache } from "react";

import { headers } from "next/headers";
/* no-op */
import { notFound } from "next/navigation";

import { AlertCircle } from "lucide-react";
import type { Metadata } from "next";

import { logInvalidTokenAccess, logUnexpectedGuestPageError } from "@core/security/security-logger";
import { validateGuestToken } from "@core/utils/guest-token";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { sanitizeForEventPay } from "@core/utils/sanitize";

import { Card } from "@/components/ui/card";

import { GuestPageClient } from "./guest-page-client";

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
      title: "参加状況管理 - みんなの集金",
      description: "イベント参加状況の管理ページ",
      robots: "noindex, nofollow",
    };
  }

  const eventTitle = sanitizeForEventPay(validation.attendance.event.title);

  return {
    title: `${eventTitle} - 参加状況管理 | みんなの集金`,
    description: `${eventTitle}の参加状況を確認・変更できます`,
    robots: "noindex, nofollow", // ゲストページは検索エンジンにインデックスされないようにする
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
      <div className="min-h-screen bg-muted/30">
        {/* メインコンテンツ */}
        <main
          className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8"
          role="main"
          aria-labelledby="page-title"
        >
          {/* セキュリティ警告 */}
          <section aria-labelledby="security-warning-title">
            <Card
              className="p-3 sm:p-4 mb-4 sm:mb-6 bg-yellow-50 border-yellow-200"
              role="region"
              aria-labelledby="security-warning-title"
            >
              <div className="flex items-start space-x-2 sm:space-x-3">
                <AlertCircle
                  className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="text-sm min-w-0 flex-1">
                  <h2 id="security-warning-title" className="font-medium text-yellow-800">
                    重要：セキュリティについて
                  </h2>
                  <div className="text-yellow-700 mt-1 leading-relaxed">
                    <p>このページのURLは他の人と共有しないでください。</p>
                    <p className="mt-1">
                      URLを知っている人は誰でもあなたの参加状況を確認・変更できます。
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          <GuestPageClient
            attendance={attendance}
            canModify={canModify}
            payment={payment}
            sessionId={session_id}
            guestToken={token}
          />

          {/* フッター情報 */}
          <footer className="mt-6 sm:mt-8 text-center" role="contentinfo">
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p>このページは参加者専用の管理ページです。</p>
              <p className="mt-1">
                ご質問やご不明点がある場合は、イベント主催者にお問い合わせください。
              </p>
            </div>
          </footer>
        </main>
      </div>
    );
  } catch (error) {
    // 予期しないエラーの場合は構造化ログを記録して404を返す
    const { getErrorDetails, logError } = await import("@core/utils/error-handler");

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

    logError(getErrorDetails("GUEST_TOKEN_VALIDATION_FAILED"), errorContext);

    if (process.env.NODE_ENV === "development") {
      const { logger } = await import("@core/logging/app-logger");
      logger.error("ゲストページでエラーが発生", {
        tag: "guestPage",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        token_prefix: token.substring(0, 4),
      });
    }
    // セキュリティログに記録（エラー詳細は記録しない）
    logUnexpectedGuestPageError(token, error, { userAgent: errorUserAgent, ip: errorIp });
    notFound();
  }
}
