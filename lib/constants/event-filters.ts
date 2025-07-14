/**
 * イベント一覧表示機能で使用する共通定数
 */

import { SortBy, SortOrder, StatusFilter, PaymentFilter } from '@/app/events/actions/get-events';

// ソートオプション
export const SORT_BY_OPTIONS: readonly SortBy[] = ['date', 'created_at', 'attendances_count', 'fee'] as const;
export const SORT_ORDER_OPTIONS: readonly SortOrder[] = ['asc', 'desc'] as const;

// フィルターオプション
export const STATUS_FILTER_OPTIONS: readonly StatusFilter[] = ['all', 'upcoming', 'ongoing', 'past', 'cancelled'] as const;
export const PAYMENT_FILTER_OPTIONS: readonly PaymentFilter[] = ['all', 'free', 'paid'] as const;

// デフォルト値
export const DEFAULT_SORT_BY: SortBy = 'date';
export const DEFAULT_SORT_ORDER: SortOrder = 'asc';
export const DEFAULT_STATUS_FILTER: StatusFilter = 'all';
export const DEFAULT_PAYMENT_FILTER: PaymentFilter = 'all';

// ラベル定義
export const SORT_BY_LABELS: Record<SortBy, string> = {
  date: '開催日時',
  created_at: '作成日時',
  attendances_count: '参加者数',
  fee: '参加費',
} as const;

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: '全て表示',
  upcoming: '開催予定',
  ongoing: '開催中',
  past: '終了済み',
  cancelled: 'キャンセル',
} as const;

export const PAYMENT_FILTER_LABELS: Record<PaymentFilter, string> = {
  all: '全て',
  free: '無料',
  paid: '有料',
} as const;

// バリデーション関数
export function isValidSortBy(value: string): value is SortBy {
  return SORT_BY_OPTIONS.includes(value as SortBy);
}

export function isValidSortOrder(value: string): value is SortOrder {
  return SORT_ORDER_OPTIONS.includes(value as SortOrder);
}

export function isValidStatusFilter(value: string): value is StatusFilter {
  return STATUS_FILTER_OPTIONS.includes(value as StatusFilter);
}

export function isValidPaymentFilter(value: string): value is PaymentFilter {
  return PAYMENT_FILTER_OPTIONS.includes(value as PaymentFilter);
}