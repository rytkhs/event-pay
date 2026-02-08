/**
 * 決済ページ専用エラーページ
 * /payments/*で発生するエラーをキャッチ
 */

"use client";

import { PaymentErrorLayout } from "@/components/errors/ErrorLayout";

interface PaymentErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 決済関連ページのエラーハンドラー
 */
export default function PaymentErrorPage({ error, reset }: PaymentErrorPageProps) {
  // エラーメッセージに基づいて適切なエラータイプを判定
  const isStripeError =
    error.message?.includes("stripe") ||
    error.message?.includes("payment") ||
    error.message?.includes("card");

  const isNetworkError =
    error.message?.includes("network") ||
    error.message?.includes("fetch") ||
    error.message?.includes("timeout");

  if (isNetworkError) {
    return (
      <PaymentErrorLayout
        title="接続エラー"
        message="決済システムとの通信でエラーが発生しました"
        description="インターネット接続をご確認の上、再度お試しください。"
        error={error}
        onRetry={reset}
      />
    );
  }

  if (isStripeError) {
    return (
      <PaymentErrorLayout
        title="決済処理エラー"
        message="カード決済処理中にエラーが発生しました"
        description="カード情報をご確認いただくか、別の決済方法をお試しください。"
        error={error}
        onRetry={reset}
      />
    );
  }

  return <PaymentErrorLayout error={error} onRetry={reset} />;
}
