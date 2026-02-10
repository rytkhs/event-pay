/**
 * 締切関連のユーティリティ
 * - effective_registration_deadline = registration_deadline ?? date
 * - effective_payment_deadline = payment_deadline ?? date
 * - final_payment_limit = allow
 *     ? min(effective_payment_deadline + grace_days, date + 30d)
 *     : effective_payment_deadline
 */
import { TIME_CONSTANTS } from "@core/constants/event-config";

export interface EventDeadlineLike {
  date: string; // ISO (UTC保管)
  registration_deadline?: string | null;
  payment_deadline?: string | null;
}

export interface FinalLimitOptions {
  allow_payment_after_deadline?: boolean | null;
  grace_period_days?: number | null; // 0-30
}

/**
 * ISO文字列をDateに変換（不正値はInvalid Dateのまま返す）
 */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * effective_registration_deadline / effective_payment_deadline を導出
 */
export function deriveEffectiveDeadlines(event: EventDeadlineLike): {
  effectiveRegistrationDeadline: Date;
  effectivePaymentDeadline: Date;
  eventDate: Date;
} {
  const eventDate = new Date(event.date);
  const reg = toDate(event.registration_deadline) ?? eventDate;
  const pay = toDate(event.payment_deadline) ?? eventDate;
  return {
    effectiveRegistrationDeadline: reg,
    effectivePaymentDeadline: pay,
    eventDate,
  };
}

/**
 * 最終支払上限を導出
 * - allow=false なら effectivePaymentDeadline のまま
 * - allow=true なら min(effectivePaymentDeadline + graceDays, eventDate + 30d)
 */
export function deriveFinalPaymentLimit(
  args: {
    effectivePaymentDeadline: Date;
    eventDate: Date;
  } & FinalLimitOptions
): Date {
  const { effectivePaymentDeadline, eventDate } = args;
  const allow = Boolean(args.allow_payment_after_deadline);
  if (!allow) return effectivePaymentDeadline;

  const graceDays = Math.max(0, Math.min(30, Number(args.grace_period_days ?? 0)));
  const candidate = new Date(
    effectivePaymentDeadline.getTime() + graceDays * TIME_CONSTANTS.MS_TO_DAYS
  );
  const eventPlus30d = new Date(eventDate.getTime() + 30 * TIME_CONSTANTS.MS_TO_DAYS);
  return new Date(Math.min(candidate.getTime(), eventPlus30d.getTime()));
}
