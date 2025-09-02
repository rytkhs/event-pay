/**
 * UI用のPaymentStatus型定義
 *
 * @core/types/enums から必要な部分のみを再エクスポート
 * components/ui の独立性を確保するためのUI専用型定義
 */

// ====================================================================
// 決済ステータス型（UI用）
// ====================================================================

/**
 * 決済状況を表すENUM型（UI用）
 */
export type PaymentStatus =
  | 'pending' // 未決済（初期状態）
  | 'paid' // 決済済（Stripe決済完了）
  | 'failed' // 決済失敗（Stripe決済失敗）
  | 'received' // 受領済（現金決済受領）
  | 'completed' // 完了（無料イベント参加確定）
  | 'refunded' // 返金済（Stripe返金処理完了）
  | 'waived' // 免除（管理者による手動免除）

/**
 * PaymentStatusの日本語表示名（UI用）
 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: '未決済',
  paid: '決済済',
  failed: '決済失敗',
  received: '受領済',
  completed: '完了',
  refunded: '返金済',
  waived: '免除',
}
