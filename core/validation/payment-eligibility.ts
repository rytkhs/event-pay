/**
 * 決済許可条件の共通ユーティリティ
 * UI/API間の条件整合性を保つために、決済関連の判定ロジックを一元化する
 */

import { AttendanceStatus, PaymentStatus, EventStatus } from "@core/types/enums";

/**
 * 決済許可判定に必要な最小限のイベント情報
 */
export interface PaymentEligibilityEvent {
  id: string;
  status: EventStatus;
  fee: number | null;
  date: string; // ISO string
  payment_deadline?: string | null; // ISO string
}

/**
 * 決済許可判定に必要な最小限の参加情報
 */
export interface PaymentEligibilityAttendance {
  id: string;
  status: AttendanceStatus;
  payment?: {
    method?: string | null;
    status?: PaymentStatus | null;
  } | null;
}

/**
 * 決済許可判定の結果
 */
export interface PaymentEligibilityResult {
  /** 決済可能かどうか */
  isEligible: boolean;
  /** 拒否理由（決済不可の場合） */
  reason?: string;
  /** 詳細なチェック結果 */
  checks: {
    isAttending: boolean;
    isPaidEvent: boolean;
    isUpcomingEvent: boolean;
    isBeforeDeadline: boolean;
    isValidPaymentMethod: boolean;
    isValidPaymentStatus: boolean;
  };
}

/**
 * ゲスト再決済ボタン表示の判定オプション
 */
export interface GuestRepayOptions {
  /** 再決済対象とする決済ステータス（デフォルト: ["failed", "pending"]） */
  allowedPaymentStatuses?: PaymentStatus[];
  /** 決済方法の制限（デフォルト: "stripe"のみ） */
  requiredPaymentMethod?: string;
}

/**
 * Stripe決済セッション作成の判定オプション
 */
export interface StripeSessionOptions {
  /** 許可する決済ステータス（デフォルト: null, "failed", "pending"） */
  allowedPaymentStatuses?: (PaymentStatus | null)[];
  /** 許可する決済方法（デフォルト: null, "stripe"） */
  allowedPaymentMethods?: (string | null)[];
}

/**
 * 基本的な決済許可条件をチェック
 * UI/API共通で使用する基盤ロジック
 */
export function checkBasicPaymentEligibility(
  attendance: PaymentEligibilityAttendance,
  event: PaymentEligibilityEvent,
  currentTime: Date = new Date()
): PaymentEligibilityResult {
  const checks = {
    isAttending: attendance.status === "attending",
    isPaidEvent: (event.fee ?? 0) > 0,
    isUpcomingEvent: event.status === "upcoming",
    isBeforeDeadline: currentTime < new Date(event.payment_deadline || event.date),
    isValidPaymentMethod: true, // 基本チェックでは制限なし
    isValidPaymentStatus: true, // 基本チェックでは制限なし
  };

  let reason: string | undefined;

  if (!checks.isAttending) {
    reason = "参加者のみ決済を行えます。";
  } else if (!checks.isPaidEvent) {
    reason = "無料イベントでは決済は不要です。";
  } else if (!checks.isUpcomingEvent) {
    reason = "キャンセル済みまたは無効な状態のイベントです。";
  } else if (!checks.isBeforeDeadline) {
    reason = "決済期限を過ぎています。";
  }

  return {
    isEligible: Object.values(checks).every(Boolean) && !reason,
    reason,
    checks,
  };
}

/**
 * ゲスト用の再決済ボタン表示判定
 * フロントエンド（guest-management-form.tsx）で使用
 */
export function canGuestRepay(
  attendance: PaymentEligibilityAttendance,
  event: PaymentEligibilityEvent,
  currentTime: Date = new Date(),
  options: GuestRepayOptions = {}
): PaymentEligibilityResult {
  const { allowedPaymentStatuses = ["failed", "pending"], requiredPaymentMethod = "stripe" } =
    options;

  // 基本条件をチェック
  const baseResult = checkBasicPaymentEligibility(attendance, event, currentTime);

  if (!baseResult.isEligible) {
    return baseResult;
  }

  // 再決済固有の条件
  const payment = attendance.payment;
  const isValidMethod = payment?.method === requiredPaymentMethod;
  const isValidStatus = payment?.status && allowedPaymentStatuses.includes(payment.status);

  const extendedChecks = {
    ...baseResult.checks,
    isValidPaymentMethod: isValidMethod,
    isValidPaymentStatus: Boolean(isValidStatus),
  };

  let reason: string | undefined = baseResult.reason;

  if (!reason && !isValidMethod) {
    reason = `決済方法が${requiredPaymentMethod}である必要があります。`;
  } else if (!reason && !isValidStatus) {
    reason = `決済ステータスが${allowedPaymentStatuses.join("または")}である必要があります。`;
  }

  return {
    isEligible: Object.values(extendedChecks).every(Boolean) && !reason,
    reason,
    checks: extendedChecks,
  };
}

/**
 * Stripe決済セッション作成の許可判定
 * サーバーサイド（create-stripe-session.ts）で使用
 */
export function canCreateStripeSession(
  attendance: PaymentEligibilityAttendance,
  event: PaymentEligibilityEvent,
  currentTime: Date = new Date(),
  options: StripeSessionOptions = {}
): PaymentEligibilityResult {
  const {
    allowedPaymentStatuses = [null, "failed", "pending"],
    allowedPaymentMethods = [null, "stripe"],
  } = options;

  // 基本条件をチェック
  const baseResult = checkBasicPaymentEligibility(attendance, event, currentTime);

  if (!baseResult.isEligible) {
    return baseResult;
  }

  // Stripe セッション作成固有の条件
  const payment = attendance.payment;
  const paymentMethod = payment?.method || null;
  const paymentStatus = payment?.status || null;

  const isValidMethod = allowedPaymentMethods.includes(paymentMethod);
  const isValidStatus = allowedPaymentStatuses.includes(paymentStatus);

  // 決済完了済み状態の除外
  const finalizedStatuses: PaymentStatus[] = [
    "paid",
    "received",
    "completed",
    "refunded",
    "waived",
  ];
  const isNotFinalized = !paymentStatus || !finalizedStatuses.includes(paymentStatus);

  const extendedChecks = {
    ...baseResult.checks,
    isValidPaymentMethod: isValidMethod,
    isValidPaymentStatus: isValidStatus && isNotFinalized,
  };

  let reason: string | undefined = baseResult.reason;

  if (!reason && !isValidMethod) {
    reason = "この参加者の支払方法はオンライン決済ではありません。";
  } else if (!reason && !isNotFinalized) {
    reason = "すでに決済は完了（または返金済み）しています。";
  } else if (!reason && !isValidStatus) {
    reason = "決済ステータスが無効です。";
  }

  return {
    isEligible: Object.values(extendedChecks).every(Boolean) && !reason,
    reason,
    checks: extendedChecks,
  };
}

/**
 * 決済期限までの残り日数を取得
 */
export function getDaysUntilPaymentDeadline(
  event: PaymentEligibilityEvent,
  currentTime: Date = new Date()
): number {
  // 動的importではなく、実装を直接記述
  const deadline = new Date(event.payment_deadline || event.date);
  const diffMs = deadline.getTime() - currentTime.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24)); // 日数計算
}
