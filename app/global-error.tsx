/**
 * Next.js App Router グローバルエラーページ
 * アプリケーション全体のクリティカルエラーをキャッチ
 * root layout.jsのエラーも含む
 */

"use client";

import { useEffect } from "react";

import { ErrorLayout } from "@/components/errors";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
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
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@eventpay.jp";
    const subject = "EventPay - 重大なエラーが発生しました";
    const body = `
エラーが発生しました。以下の情報をお送りします：

エラーメッセージ: ${error.message}
発生時刻: ${new Date().toISOString()}
ページURL: ${typeof window !== "undefined" ? window.location.href : "不明"}
ユーザーエージェント: ${typeof window !== "undefined" ? window.navigator.userAgent : "不明"}

${error.digest ? `エラーID: ${error.digest}` : ""}
    `.trim();

    window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>エラーが発生しました - EventPay</title>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body>
        <ErrorLayout
          code="500"
          category="server"
          severity="critical"
          title="アプリケーションエラー"
          message="EventPayで重大なエラーが発生しました"
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
