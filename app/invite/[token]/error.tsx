/**
 * 招待リンク専用エラーページ
 * /invite/[token]で発生するエラーをキャッチ
 */

"use client";

import { ErrorLayout } from "@/components/errors";

interface InviteErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 招待リンクのエラーハンドラー
 */
export default function InviteErrorPage({ error, reset }: InviteErrorPageProps) {
  return (
    <ErrorLayout
      code="INTERNAL_ERROR"
      category="business"
      severity="medium"
      title="招待リンクの処理エラー"
      message="招待リンクの処理中にエラーが発生しました"
      description="招待リンクが正しいかご確認いただくか、主催者にお問い合わせください。"
      showRetry={true}
      showHome={true}
      onRetry={reset}
      error={error}
      size="md"
    />
  );
}
