/**
 * 招待リンク専用404エラーページ
 * 無効または存在しない招待リンクへのアクセス
 */

import { ErrorLayout } from "@/components/errors";

/**
 * 無効な招待リンクの404ページ
 */
export default function InviteNotFoundPage() {
  return (
    <ErrorLayout
      code="INVALID_INVITE"
      category="business"
      severity="medium"
      title="無効な招待リンク"
      message="この招待リンクは無効または期限切れです"
      description="正しい招待リンクをご確認いただくか、イベント主催者にお問い合わせください。"
      showRetry={false}
      showHome={true}
      enableLogging={false}
    />
  );
}
