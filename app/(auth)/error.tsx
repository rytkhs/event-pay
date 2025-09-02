/**
 * 認証ページ専用エラーページ
 * /(auth)/*で発生するエラーをキャッチ
 */

"use client";

import { AuthErrorLayout } from "@/components/errors";

interface AuthErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 認証関連ページのエラーハンドラー
 */
export default function AuthErrorPage({ error, reset }: AuthErrorPageProps) {
  // エラーメッセージに基づいて適切なエラータイプを判定
  const isAuthenticationError =
    error.message?.includes("authentication") ||
    error.message?.includes("login") ||
    error.message?.includes("認証");

  if (isAuthenticationError) {
    return (
      <AuthErrorLayout
        title="認証エラー"
        message="ログイン処理中にエラーが発生しました"
        description="認証情報をご確認の上、再度ログインしてください。"
        error={error}
        onRetry={reset}
      />
    );
  }

  return (
    <AuthErrorLayout
      title="認証ページでエラーが発生しました"
      message="認証システムで問題が発生しました"
      description="しばらく時間をおいて再度お試しください。問題が続く場合はサポートにお問い合わせください。"
      error={error}
      onRetry={reset}
      customActions={[
        {
          label: "再試行",
          action: reset,
          variant: "default",
        },
      ]}
    />
  );
}
