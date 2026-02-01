/**
 * Next.js App Router グローバルエラーページ
 * アプリケーション全体のクリティカルエラーをキャッチ
 * root layout.jsのエラーも含む
 */

"use client";

import { useEffect } from "react";

import { ga4Client } from "@core/analytics/ga4-client";

import { ErrorLayout } from "@/components/errors";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // グローバルエラーをGA4に送信
    ga4Client.sendEvent({
      name: "exception",
      params: {
        description: `Global Error: ${error.message}${error.digest ? ` (${error.digest})` : ""}`,
        fatal: true,
      },
    });

    // グローバルエラーの発生をトラッキング
    // 本番環境では重要度が最高レベル
    if (process.env.NODE_ENV === "production") {
      // 外部モニタリングサービスに送信
      // 例: Sentry, DataDog, New Relic等
    }
  }, [error]);

  const handleReset = () => {
    try {
      reset();
    } catch (_resetError) {
      // reset に失敗した場合はページリロード
      window.location.reload();
    }
  };

  const handleSupport = () => {
    // お問い合わせページにリダイレクト
    window.location.href = "/contact";
  };

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>エラーが発生しました - みんなの集金</title>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body>
        <ErrorLayout
          code="INTERNAL_ERROR"
          severity="critical"
          title="アプリケーションエラー"
          message="みんなの集金で重大なエラーが発生しました"
          description="システム管理者に通報済みです。ご不便をおかけして申し訳ございません。"
          showRetry={true}
          showHome={true}
          showSupport={true}
          onRetry={handleReset}
          error={error}
          customActions={[
            {
              label: "サポートに連絡",
              action: handleSupport,
              variant: "outline",
            },
          ]}
        >
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">
              <strong>重要:</strong> このエラーは自動的にシステム管理者に報告されました。
              緊急の場合は直接サポートにお問い合わせください。
            </p>
          </div>

          {error.digest && (
            <div className="mb-6 p-3 bg-gray-100 border rounded-lg">
              <p className="text-xs text-gray-600">
                <strong>エラーID:</strong> {error.digest}
                <br />
                <span className="text-gray-500">
                  サポートにお問い合わせの際は、このIDをお知らせください。
                </span>
              </p>
            </div>
          )}
        </ErrorLayout>
      </body>
    </html>
  );
}
