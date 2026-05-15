/**
 * 金額表示ユーティリティ
 */
/**
 * 金額を3桁区切りでフォーマット
 * @param amount 金額
 * @returns フォーマット済み文字列（例：3,000）
 */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString("ja-JP");
}
