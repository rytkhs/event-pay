/**
 * ゲスト参加制限に関するユーティリティ関数
 *
 * ゲストページでの変更可否や決済期限状態の判定を提供します。
 */

import { type GuestAttendanceData } from "@core/types/guest";

import { deriveEffectiveDeadlines, deriveFinalPaymentLimit } from "./deadlines";

/**
 * 変更不可の理由
 */
export type ModificationRestrictionReason =
  | "canceled" // イベント中止
  | "deadline_passed" // 登録締切超過
  | "none"; // 制限なし

/**
 * 決済期限の状態
 */
export type PaymentDeadlineStatus =
  | "normal" // 通常期限内
  | "grace_period" // 猶予期間中
  | "expired"; // 期限超過

/**
 * ゲスト参加状況の変更不可理由を判定
 *
 * @param attendance ゲスト参加データ
 * @param currentTime 現在時刻（テスト用、デフォルトは現在時刻）
 * @returns 変更不可の理由
 */
export function getModificationRestrictionReason(
  attendance: GuestAttendanceData,
  currentTime: Date = new Date()
): ModificationRestrictionReason {
  const event = attendance.event;

  // 1. イベント中止チェック
  if (event.canceled_at) {
    return "canceled";
  }

  // 2. 登録締切チェック
  if (event.registration_deadline) {
    const registrationDeadline = new Date(event.registration_deadline);
    if (currentTime >= registrationDeadline) {
      return "deadline_passed";
    }
  }

  return "none";
}

/**
 * 決済期限の状態を判定
 *
 * @param attendance ゲスト参加データ
 * @param currentTime 現在時刻（テスト用、デフォルトは現在時刻）
 * @returns 決済期限の状態
 */
export function getPaymentDeadlineStatus(
  attendance: GuestAttendanceData,
  currentTime: Date = new Date()
): PaymentDeadlineStatus {
  const event = attendance.event;

  // 有効な決済期限を導出
  const { effectivePaymentDeadline, eventDate } = deriveEffectiveDeadlines({
    date: event.date,
    registration_deadline: event.registration_deadline,
    payment_deadline: event.payment_deadline,
  });

  // 通常の決済期限内かチェック
  if (currentTime <= effectivePaymentDeadline) {
    return "normal";
  }

  // 猶予期間の設定がある場合、最終支払上限を計算
  const allowPaymentAfterDeadline = event.allow_payment_after_deadline ?? false;
  const gracePeriodDays = event.grace_period_days ?? 0;

  if (allowPaymentAfterDeadline && gracePeriodDays > 0) {
    const finalPaymentLimit = deriveFinalPaymentLimit({
      effectivePaymentDeadline,
      eventDate,
      allow_payment_after_deadline: allowPaymentAfterDeadline,
      grace_period_days: gracePeriodDays,
    });

    // 猶予期間内かチェック
    if (currentTime <= finalPaymentLimit) {
      return "grace_period";
    }
  }

  return "expired";
}
