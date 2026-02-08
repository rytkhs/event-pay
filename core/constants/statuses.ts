import type {
  AttendanceStatus,
  EventStatus,
  PaymentMethod,
  PaymentStatus,
  StripeAccountStatus,
} from "@core/types/statuses";

export const EVENT_STATUS_VALUES = [
  "upcoming",
  "ongoing",
  "past",
  "canceled",
] as const satisfies readonly EventStatus[];

export const PAYMENT_METHOD_VALUES = ["stripe", "cash"] as const satisfies readonly PaymentMethod[];

export const PAYMENT_STATUS_VALUES = [
  "pending",
  "paid",
  "failed",
  "received",
  "refunded",
  "waived",
  "canceled",
] as const satisfies readonly PaymentStatus[];

export const ATTENDANCE_STATUS_VALUES = [
  "attending",
  "not_attending",
  "maybe",
] as const satisfies readonly AttendanceStatus[];

export const STRIPE_ACCOUNT_STATUS_VALUES = [
  "unverified",
  "onboarding",
  "verified",
  "restricted",
] as const satisfies readonly StripeAccountStatus[];

export function isValidPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHOD_VALUES.includes(value as PaymentMethod);
}

export function isValidPaymentStatus(value: string): value is PaymentStatus {
  return PAYMENT_STATUS_VALUES.includes(value as PaymentStatus);
}
