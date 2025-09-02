/**
 * イベントページ専用エラーページ
 * /events/*で発生するエラーをキャッチ
 */

'use client'

import { ErrorLayout } from '@/components/errors'

interface EventsErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * イベント関連ページのエラーハンドラー
 */
export default function EventsErrorPage({ error, reset }: EventsErrorPageProps) {
  return (
    <ErrorLayout
      code="500"
      category="business"
      severity="medium"
      title="イベントの読み込みに失敗しました"
      message="イベント情報の取得中にエラーが発生しました"
      description="しばらく時間をおいて再度お試しください。問題が続く場合はイベント主催者にお問い合わせください。"
      showRetry={true}
      showHome={true}
      showBack={true}
      onRetry={reset}
      error={error}
      size="md"
    />
  )
}
