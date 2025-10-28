/**
 * 手数料計算ユーティリティ
 * イベント作成時の手取り額表示などで使用
 */

/**
 * Stripe手数料を計算（MVP段階：3.6%、固定費0円）
 * @param amount 参加費（円）
 * @returns Stripe手数料（円）
 */
export function calculateStripeFee(amount: number): number {
  if (amount < 100) return 0;
  const STRIPE_RATE = 0.036;
  return Math.ceil(amount * STRIPE_RATE);
}

/**
 * オンライン決済時の手取り額を計算
 * @param amount 参加費（円）
 * @returns 手取り額（円）
 */
export function calculateNetAmount(amount: number): number {
  if (amount < 100) return 0;
  const PLATFORM_FEE_RATE = 0.049; // 4.9%
  const stripeFee = calculateStripeFee(amount);
  const platformFee = Math.round(amount * PLATFORM_FEE_RATE);
  return amount - stripeFee - platformFee;
}

/**
 * 金額を3桁区切りでフォーマット
 * @param amount 金額
 * @returns フォーマット済み文字列（例：3,000）
 */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString("ja-JP");
}
