/**
 * Next.js App Router ルートエラーページ
 * アプリケーションレベルのエラーをキャッチ
 */

"use client";

import { useEffect } from "react";

import { ga4Client } from "@core/analytics/ga4-client";

import { ErrorLayout } from "@/components/errors";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * ルートレベルのエラーページ
 * layout.tsx以下の全てのページでエラーが発生した際に表示される
 */
export default function RootErrorPage({ error, reset }: ErrorPageProps) {
  // エラー発生時にGA4にexceptionイベントを送信
  useEffect(() => {
    ga4Client.sendEvent({
      name: "exception",
      params: {
        description: error.message || "Unknown error",
        fatal: true,
      },
    });
  }, [error]);

  return (
    <ErrorLayout
      code="500"
      category="server"
      severity="high"
      title="エラーが発生しました"
      message="申し訳ございません。予期しないエラーが発生しました"
      description="ページを再読み込みするか、ホームページに戻ってください。問題が続く場合はサポートにお問い合わせください。"
      showRetry={true}
      showHome={true}
      showSupport={true}
      onRetry={reset}
      error={error}
    />
  );
}
