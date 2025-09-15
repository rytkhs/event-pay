/**
 * イベント関連の共通型定義
 * フィルタリング・ソート機能で使用される汎用型
 */

// ====================================================================
// イベントフィルタ・ソート型
// ====================================================================

/**
 * イベントステータスフィルタ型
 */
export type StatusFilter = "all" | "upcoming" | "ongoing" | "past" | "canceled";

/**
 * 支払いフィルタ型
 */
export type PaymentFilter = "all" | "free" | "paid";

/**
 * ソート項目型
 */
export type SortBy = "date" | "created_at" | "attendances_count" | "fee";

/**
 * ソート順序型
 */
export type SortOrder = "asc" | "desc";
