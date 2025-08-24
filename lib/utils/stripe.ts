/**
 * Stripe関連のユーティリティ
 */

/**
 * イベント単位のTransfer Group名を生成する
 * - PaymentIntent(課金)とTransfer(送金)のグルーピングに使用
 * - 命名規則をアプリ全体で統一: `event_<eventId>_payout`
 */
export function getTransferGroupForEvent(eventId: string): string {
  return `event_${eventId}_payout`;
}
