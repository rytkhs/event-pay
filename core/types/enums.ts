/**
 * EventPay ENUM型の型定義
 * DB-001: ENUM型定義に対応するTypeScript型
 *
 * データベースのENUM型と1:1で対応する型定義を提供し、
 * フロントエンドとバックエンドでの型安全性を確保します。
 */

import { Database } from "@/types/database";

// ====================================================================
// イベントステータス型
// ====================================================================
/**
 * イベントの進行状況を表すENUM型
 */
export type EventStatus =
  | "upcoming" // 開催予定（デフォルト）
  | "ongoing" // 開催中
  | "past" // 終了
  | "canceled"; // キャンセル

/**
 * イベントステータスの定数定義
 */
export const EVENT_STATUS = {
  UPCOMING: "upcoming" as const,
  ONGOING: "ongoing" as const,
  PAST: "past" as const,
  CANCELED: "canceled" as const,
} as const;

/**
 * イベントステータスの有効な値の配列
 */
export const EVENT_STATUS_VALUES: EventStatus[] = Object.values(EVENT_STATUS);

// ====================================================================
// 決済方法型
// ====================================================================
/**
 * 決済方法を表すENUM型
 * データベースのpayment_method_enumと完全に一致
 */
export type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];

/**
 * 決済方法の定数定義
 */
export const PAYMENT_METHOD = {
  STRIPE: "stripe" as const,
  CASH: "cash" as const,
} as const;

/**
 * 決済方法の有効な値の配列
 */
export const PAYMENT_METHOD_VALUES: PaymentMethod[] = ["stripe", "cash"];

// ====================================================================
// 決済ステータス型
// ====================================================================
/**
 * 決済状況を表すENUM型
 */
export type PaymentStatus =
  | "pending" // 未決済（初期状態）
  | "paid" // 決済済（Stripe決済完了）
  | "failed" // 決済失敗（Stripe決済失敗）
  | "received" // 受領済（現金決済受領）
  | "refunded" // 返金済（Stripe返金処理完了）
  | "waived" // 免除（管理者による手動免除）
  | "canceled"; // キャンセル済（申込みトランザクションの取り消し）

/**
 * 決済ステータスの定数定義
 */
export const PAYMENT_STATUS = {
  PENDING: "pending" as const,
  PAID: "paid" as const,
  FAILED: "failed" as const,
  RECEIVED: "received" as const,
  REFUNDED: "refunded" as const,
  WAIVED: "waived" as const,
  CANCELED: "canceled" as const,
} as const;

/**
 * 決済ステータスの有効な値の配列
 */
export const PAYMENT_STATUS_VALUES: PaymentStatus[] = Object.values(PAYMENT_STATUS);

// ====================================================================
// 参加ステータス型
// ====================================================================
/**
 * 参加意思を表すENUM型
 */
export type AttendanceStatus =
  | "attending" // 参加（決済対象）
  | "not_attending" // 不参加
  | "maybe"; // 未定（後で変更可能、決済なし）

/**
 * 参加ステータスの定数定義
 */
export const ATTENDANCE_STATUS = {
  ATTENDING: "attending" as const,
  NOT_ATTENDING: "not_attending" as const,
  MAYBE: "maybe" as const,
} as const;

/**
 * 参加ステータスの有効な値の配列
 */
export const ATTENDANCE_STATUS_VALUES: AttendanceStatus[] = Object.values(ATTENDANCE_STATUS);

// ====================================================================
// Stripe Connectアカウントステータス型
// ====================================================================
/**
 * Stripe Connectアカウントの状況を表すENUM型
 */
export type StripeAccountStatus =
  | "unverified" // 未認証（アカウント未設定）
  | "onboarding" // オンボーディング中（設定途中）
  | "verified" // 認証済（決済受付可能）
  | "restricted"; // 制限中（一時的な制限状態）

/**
 * Stripe Connectアカウントステータスの定数定義
 */
export const STRIPE_ACCOUNT_STATUS = {
  UNVERIFIED: "unverified" as const,
  ONBOARDING: "onboarding" as const,
  VERIFIED: "verified" as const,
  RESTRICTED: "restricted" as const,
} as const;

/**
 * Stripe Connectアカウントステータスの有効な値の配列
 */
export const STRIPE_ACCOUNT_STATUS_VALUES: StripeAccountStatus[] =
  Object.values(STRIPE_ACCOUNT_STATUS);

// ====================================================================
// 注意: Payout機能は削除済み
// ====================================================================
// Destination Charges移行により、リアルタイム送金となったため
// 別途payout処理は不要となりました。
// settlements テーブルはレポート・スナップショット用途のみです。

// ====================================================================
// ヘルパー関数
// ====================================================================

/**
 * 値が有効なPaymentMethodかどうかを判定
 */
export function isValidPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHOD_VALUES.includes(value as PaymentMethod);
}

/**
 * 値が有効なPaymentStatusかどうかを判定
 */
export function isValidPaymentStatus(value: string): value is PaymentStatus {
  return PAYMENT_STATUS_VALUES.includes(value as PaymentStatus);
}

// ====================================================================
// 表示名マッピング
// ====================================================================

/**
 * EventStatusの日本語表示名
 */
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  upcoming: "開催予定",
  ongoing: "開催中",
  past: "終了",
  canceled: "キャンセル",
};

/**
 * PaymentStatusの日本語表示名
 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "未決済",
  paid: "決済済",
  failed: "決済失敗",
  received: "受領済",
  refunded: "返金済",
  waived: "免除",
  canceled: "キャンセル済",
};

/**
 * AttendanceStatusの日本語表示名
 */
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  attending: "参加",
  not_attending: "不参加",
  maybe: "未定",
};

/**
 * StripeAccountStatusの日本語表示名
 */
export const STRIPE_ACCOUNT_STATUS_LABELS: Record<StripeAccountStatus, string> = {
  unverified: "未認証",
  onboarding: "設定中",
  verified: "認証済",
  restricted: "制限中",
};

// PayoutStatus関連のラベルは削除済み（Destination Charges移行により不要）
