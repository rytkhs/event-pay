/**
 * ゲストページ専用404エラーページ
 * 無効な管理URLへのアクセス
 */

import { ErrorLayout } from "@/components/errors/ErrorLayout";

/**
 * ゲスト管理URLの404ページ
 */
export default function GuestNotFoundPage() {
  return (
    <ErrorLayout
      code="NOT_FOUND"
      category="security"
      severity="medium"
      title="アクセスできません"
      message="無効なアクセスです。正しい管理URLをご確認ください"
      description="管理URLは参加登録完了時に送信されたメールに記載されています。"
      showRetry={false}
      showHome={true}
      enableLogging={false}
    >
      <div className="mb-6 p-4 bg-info/10 border border-info/20 rounded-lg">
        <p className="text-sm text-info">
          管理URLを紛失された場合は、主催者にお問い合わせください。
        </p>
      </div>
    </ErrorLayout>
  );
}
