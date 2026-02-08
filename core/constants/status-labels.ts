import type {
  AttendanceStatus,
  EventStatus,
  PaymentMethod,
  PaymentStatus,
  StripeAccountStatus,
} from "@core/types/statuses";

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  upcoming: "開催予定",
  ongoing: "開催中",
  past: "終了",
  canceled: "キャンセル",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "オンライン決済",
  cash: "現金決済",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "未決済",
  paid: "決済済",
  failed: "決済失敗",
  received: "受領済",
  refunded: "返金済",
  waived: "免除",
  canceled: "キャンセル済",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  attending: "参加",
  not_attending: "不参加",
  maybe: "未定",
};

export const STRIPE_ACCOUNT_STATUS_LABELS: Record<StripeAccountStatus, string> = {
  unverified: "未認証",
  onboarding: "設定中",
  verified: "認証済",
  restricted: "制限中",
};
