/**
 * ダッシュボードページ専用エラーページ
 * /(dashboard)/*で発生するエラーをキャッチ
 */

'use client'

import { ErrorLayout } from '@/components/errors'

interface DashboardErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * ダッシュボード関連ページのエラーハンドラー
 */
export default function DashboardErrorPage({ error, reset }: DashboardErrorPageProps) {
  return (
    <ErrorLayout
      code="500"
      category="business"
      severity="medium"
      title="ダッシュボードエラー"
      message="ダッシュボードの読み込み中にエラーが発生しました"
      description="データの取得に失敗しました。ページを再読み込みするか、しばらく時間をおいて再度お試しください。"
      showRetry={true}
      showHome={true}
      showBack={true}
      onRetry={reset}
      error={error}
      size="md"
    />
  )
}
