/**
 * Next.js App Router ルート404ページ
 * アプリケーション全体のNot Foundエラー
 */

import { NotFoundLayout } from '@/components/errors'

/**
 * ルートレベルの404エラーページ
 */
export default function RootNotFoundPage() {
  return (
    <NotFoundLayout
      title="ページが見つかりません"
      message="お探しのページは存在しないか、移動された可能性があります"
      description="URLをご確認いただくか、ホームページに戻ってください。"
      showBack={true}
    />
  )
}
