/**
 * 認証ページ専用404エラーページ
 * /(auth)/*で存在しないページへのアクセス
 */

"use client";

import { NotFoundLayout } from "@/components/errors/ErrorLayout";

/**
 * 認証関連ページの404エラー
 */
export default function AuthNotFoundPage() {
  const handleGoToLogin = () => {
    window.location.href = "/auth/login";
  };

  return (
    <NotFoundLayout
      title="認証ページが見つかりません"
      message="お探しの認証ページは存在しません"
      description="正しいURLをご確認いただくか、ログインページに戻ってください。"
      showBack={true}
      customActions={[
        {
          label: "ログインページ",
          action: handleGoToLogin,
          variant: "default",
        },
      ]}
    />
  );
}
