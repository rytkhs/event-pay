import type { AttendanceStatus, EventStatus, PaymentMethod } from "@core/types/statuses";

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

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  attending: "参加",
  not_attending: "不参加",
  maybe: "未定",
};
