/**
 * ペイアウトページ専用エラーページ
 * /payouts/*で発生するエラーをキャッチ
 */

'use client'

import { ErrorLayout } from '@/components/errors'

interface PayoutErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * ペイアウト関連ページのエラーハンドラー
 */
export default function PayoutErrorPage({ error, reset }: PayoutErrorPageProps) {
  return (
    <ErrorLayout
      code="500"
      category="payment"
      severity="high"
      title="ペイアウトエラー"
      message="支払い処理中にエラーが発生しました"
      description="支払い情報の処理に問題が発生しました。しばらく時間をおいて再度お試しください。問題が続く場合はサポートにお問い合わせください。"
      showRetry={true}
      showHome={true}
      showSupport={true}
      onRetry={reset}
      error={error}
      size="md"
    />
  )
}
