/**
 * テスト用日時ヘルパー
 *
 * テストで使用する日時生成関数を提供
 */

/**
 * 将来の日時を生成（ISO 8601形式）
 *
 * @param hoursFromNow 現在から何時間後か（デフォルト: 24時間）
 * @returns ISO 8601形式の日時文字列（例: "2025-01-15T10:30:00.000Z"）
 */
export function getFutureDateTime(hoursFromNow: number = 24): string {
  const futureDate = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return futureDate.toISOString();
}

/**
 * 過去の日時を生成（ISO 8601形式）
 *
 * @param hoursAgo 現在から何時間前か（デフォルト: 24時間）
 * @returns ISO 8601形式の日時文字列（例: "2025-01-14T10:30:00.000Z"）
 */
export function getPastDateTime(hoursAgo: number = 24): string {
  const pastDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return pastDate.toISOString();
}

/**
 * 将来の日時を生成（datetime-local形式）
 *
 * @param hoursFromNow 現在から何時間後か（デフォルト: 24時間）
 * @returns datetime-local形式の日時文字列（例: "2025-01-15T10:30"）
 */
export function getFutureDateTimeLocal(hoursFromNow: number = 24): string {
  // テスト実行時間を考慮してより長い時間を設定
  const futureDate = new Date(Date.now() + (hoursFromNow + 1) * 60 * 60 * 1000);
  // datetime-localフォーマット（YYYY-MM-DDTHH:mm）
  return futureDate.toISOString().slice(0, 16);
}
