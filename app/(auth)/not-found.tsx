/**
 * 認証ページ専用404エラーページ
 * /(auth)/*で存在しないページへのアクセス
 */

import { NotFoundLayout } from "@/components/errors";

/**
 * 認証関連ページの404エラー
 */
export default function AuthNotFoundPage() {
  return (
    <NotFoundLayout
      title="認証ページが見つかりません"
      message="お探しの認証ページは存在しません"
      description="正しいURLをご確認いただくか、ログインページに戻ってください。"
      showBack={true}
      customActions={[
        {
          label: "ログインページ",
          action: () => (window.location.href = "/auth/login"),
          variant: "default",
        },
      ]}
    />
  );
}
