/**
 * 参加者スマートソート ユーティリティ
 *
 * 参加状況・決済状況・決済方法・日時を総合的に考慮した優先度ベースソート
 */

import type { PaymentStatus } from "@core/types/statuses";
import type { ParticipantView } from "@core/validation/participant-management";

import { toSimplePaymentStatus } from "./payment-status-mapper";

/**
 * タイムスタンプ変換ヘルパー
 */
const toTimestamp = (dateString: string | null | undefined): number => {
  return dateString ? new Date(dateString).getTime() : 0;
};

/**
 * 参加状況の重み付け
 * @param status 参加状況
 * @param isFreeEvent 無料イベントかどうか
 * @returns 重み（小さいほど上位）
 */
function getAttendanceWeight(status: string, isFreeEvent: boolean): number {
  if (isFreeEvent) {
    // 無料イベント：参加者を最優先
    return status === "attending" ? 0 : status === "maybe" ? 1 : 2;
  }
  // 有料イベント：参加者優先だが決済状況がより重要
  return status === "attending" ? 0 : status === "maybe" ? 3 : 4;
}

/**
 * 決済状況の重み付け（簡略化ステータス）
 * @param paymentStatus 決済ステータス
 * @returns 重み（小さいほど上位）
 */
function getPaymentStatusWeight(paymentStatus: PaymentStatus | null): number {
  const simple = toSimplePaymentStatus(paymentStatus);
  switch (simple) {
    case "unpaid":
      return 0; // 未決済を最優先（要対応）
    case "paid":
      return 1; // 決済済み
    case "waived":
      return 2; // 免除
    case "refunded":
      return 3; // 返金済み
    default:
      return 9; // 不明
  }
}

/**
 * 決済方法の重み付け
 * @param method 決済方法
 * @returns 重み（小さいほど上位）
 */
function getPaymentMethodWeight(method: string | null | undefined): number {
  if (!method) return 0.5; // 不明
  return method === "cash" ? 0 : method === "stripe" ? 1 : 0.5;
}

/**
 * 参加者スマートソート実行
 * @param participants 参加者データ
 * @param isFreeEvent 無料イベントかどうか
 * @returns ソート済み参加者データ
 */
function applySmartSort(participants: ParticipantView[], isFreeEvent: boolean): ParticipantView[] {
  const sorted = [...participants];

  sorted.sort((a, b) => {
    // 1. 参加状況による重み付け
    const attendanceWeightA = getAttendanceWeight(a.status, isFreeEvent);
    const attendanceWeightB = getAttendanceWeight(b.status, isFreeEvent);
    if (attendanceWeightA !== attendanceWeightB) {
      return attendanceWeightA - attendanceWeightB;
    }

    // 2. 無料イベントの場合は参加状況 + 更新日時で終了
    if (isFreeEvent) {
      const updatedAtA = toTimestamp(a.attendance_updated_at);
      const updatedAtB = toTimestamp(b.attendance_updated_at);
      return updatedAtB - updatedAtA; // 新しい順
    }

    // 3. 有料イベント：決済状況による重み付け
    const paymentWeightA = getPaymentStatusWeight(a.payment_status);
    const paymentWeightB = getPaymentStatusWeight(b.payment_status);
    if (paymentWeightA !== paymentWeightB) {
      return paymentWeightA - paymentWeightB;
    }

    // 4. 決済方法による重み付け
    const methodWeightA = getPaymentMethodWeight(a.payment_method);
    const methodWeightB = getPaymentMethodWeight(b.payment_method);
    if (methodWeightA !== methodWeightB) {
      return methodWeightA - methodWeightB;
    }

    // 5. 支払い日時降順
    const paidAtA = toTimestamp(a.paid_at);
    const paidAtB = toTimestamp(b.paid_at);
    if (paidAtA !== paidAtB) {
      return paidAtB - paidAtA; // 新しい順
    }

    // 6. 最後に参加状況更新日時降順
    const updatedAtA = toTimestamp(a.attendance_updated_at);
    const updatedAtB = toTimestamp(b.attendance_updated_at);
    return updatedAtB - updatedAtA; // 新しい順
  });

  return sorted;
}

/**
 * スマートソート適用のヘルパー関数
 * @param participants 参加者データ
 * @param isFreeEvent 無料イベントかどうか
 * @param smartActive スマートソートが有効かどうか
 * @returns ソート済み参加者データ（smartActiveがfalseの場合は元データをそのまま返す）
 */
export function conditionalSmartSort(
  participants: ParticipantView[],
  isFreeEvent: boolean,
  smartActive: boolean
): ParticipantView[] {
  if (!smartActive) return participants;
  return applySmartSort(participants, isFreeEvent);
}
