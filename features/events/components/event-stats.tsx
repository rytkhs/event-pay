import React from "react";

import type { Event, Attendance, Payment } from "@core/types/models";

// 統計表示に必要な最小限のフィールドのみを抽出
type EventStatsAttendanceData = Pick<Attendance, "id" | "status">;
type EventStatsPaymentData = Pick<Payment, "id" | "method" | "amount" | "status" | "attendance_id">;

interface EventStatsProps {
  eventData: Event;
  attendances: EventStatsAttendanceData[];
  payments: EventStatsPaymentData[];
}

export function EventStats({ eventData, attendances, payments }: EventStatsProps) {
  // 参加情報をstatusごとにグループ化（1回のループで全て計算）
  const attendanceStats = attendances.reduce(
    (acc, attendance) => {
      acc[attendance.status] = (acc[attendance.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const attendingCount = attendanceStats.attending || 0;
  const notAttendingCount = attendanceStats.not_attending || 0;
  const maybeCount = attendanceStats.maybe || 0;

  // attendance_id → attendance.status のマップを作成
  const attendanceStatusMap = new Map<string, "attending" | "not_attending" | "maybe">();
  attendances.forEach((attendance) => {
    attendanceStatusMap.set(attendance.id, attendance.status);
  });

  // 決済情報をstatus×methodでグループ化（1回のループで全て計算）
  // 設計方針（会計原則）: 入金があれば参加状態に関わらず売上として計上
  const paymentStats = payments.reduce(
    (acc, payment) => {
      const attendanceStatus = attendanceStatusMap.get(payment.attendance_id);

      // 全体の統計（attendance.statusに関わらず集計）
      const key = `${payment.status}_${payment.method}`;
      acc[key] = (acc[key] || 0) + payment.amount;
      acc[payment.status] = (acc[payment.status] || 0) + payment.amount;
      acc.total += payment.amount;
      acc.count[payment.status] = (acc.count[payment.status] || 0) + 1;

      // 売上集計（会計原則: 入金があれば参加状態に関わらず計上）
      if (payment.status === "paid" || payment.status === "received") {
        acc.totalRevenue = (acc.totalRevenue || 0) + payment.amount;

        // 参加者分の売上
        if (attendanceStatus === "attending") {
          acc.activeRevenue = (acc.activeRevenue || 0) + payment.amount;
          if (payment.status === "paid" && payment.method === "stripe") {
            acc.activeStripeRevenue = (acc.activeStripeRevenue || 0) + payment.amount;
          }
          if (payment.status === "received" && payment.method === "cash") {
            acc.activeCashRevenue = (acc.activeCashRevenue || 0) + payment.amount;
          }
        }
        // キャンセル（決済済み）: 不参加または未定
        // 決済後に参加→不参加/未定に変更された場合
        else if (attendanceStatus === "not_attending" || attendanceStatus === "maybe") {
          acc.canceledRevenue = (acc.canceledRevenue || 0) + payment.amount;
        }
      }
      // 未収集計
      else if (payment.status === "pending" || payment.status === "failed") {
        acc.unpaid = (acc.unpaid || 0) + payment.amount;
      }

      return acc;
    },
    {
      total: 0,
      count: {} as Record<string, number>,
      totalRevenue: 0, // 全売上（参加状態に関わらず）
      activeRevenue: 0, // 参加者分の売上
      activeStripeRevenue: 0,
      activeCashRevenue: 0,
      canceledRevenue: 0, // キャンセル決済分
      unpaid: 0,
    } as Record<string, number> & {
      total: number;
      count: Record<string, number>;
      totalRevenue: number;
      activeRevenue: number;
      activeStripeRevenue: number;
      activeCashRevenue: number;
      canceledRevenue: number;
      unpaid: number;
    }
  );

  // 売上合計を計算（入金があれば全て計上）
  const totalRevenue = paymentStats.totalRevenue || 0;

  // 参加者分の売上
  const activeRevenue = paymentStats.activeRevenue || 0;

  // Stripe決済分を計算（参加者分のみ）
  const stripeRevenue = paymentStats.activeStripeRevenue || 0;

  // 現金決済分を計算（参加者分のみ）
  const cashRevenue = paymentStats.activeCashRevenue || 0;

  // キャンセル決済分
  const canceledRevenue = paymentStats.canceledRevenue || 0;

  // 返金済み金額を計算（全体から、参加状態に関わらず）
  const refundedAmount = paymentStats.refunded || 0;

  // 未決済金額を計算
  const pendingAmount = paymentStats.unpaid || 0;

  // 期待売上を計算（参加予定者数 × 参加費）
  const expectedRevenue = eventData.fee === 0 ? 0 : attendingCount * eventData.fee;

  // 参加率を計算（参加予定者数 / 定員 × 100）
  const attendanceRate =
    eventData.capacity && eventData.capacity > 0
      ? Math.round((attendingCount / eventData.capacity) * 100)
      : 0;

  // 定員超過状態を判定（参加予定者数 > 定員）
  const capacityExceeded = eventData.capacity ? attendingCount > eventData.capacity : false;

  return (
    <div data-testid="event-stats" className="bg-white rounded-lg border p-6 space-y-4">
      <h2 className="text-xl font-bold text-gray-900 mb-4">イベント統計</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600" data-testid="attending-count">
            {attendingCount}
          </div>
          <div className="text-sm text-gray-600">参加予定</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-600" data-testid="not-attending-count">
            {notAttendingCount}
          </div>
          <div className="text-sm text-gray-600">不参加</div>
        </div>
        <div className="text-center p-3 bg-yellow-50 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600" data-testid="maybe-count">
            {maybeCount}
          </div>
          <div className="text-sm text-gray-600">未定</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600" data-testid="attendance-rate">
            {attendanceRate}%
          </div>
          <div className="text-sm text-gray-600">参加率</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600" data-testid="total-revenue">
            ¥{activeRevenue.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">売上合計（参加者分）</div>
        </div>
        <div className="text-center p-3 bg-indigo-50 rounded-lg">
          <div className="text-2xl font-bold text-indigo-600" data-testid="stripe-revenue">
            ¥{stripeRevenue.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">Stripe決済</div>
        </div>
        <div className="text-center p-3 bg-teal-50 rounded-lg">
          <div className="text-2xl font-bold text-teal-600" data-testid="cash-revenue">
            ¥{cashRevenue.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">現金決済</div>
        </div>
        <div className="text-center p-3 bg-orange-50 rounded-lg">
          <div className="text-2xl font-bold text-orange-600" data-testid="pending-amount">
            ¥{pendingAmount.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">未決済</div>
        </div>
      </div>

      {/* キャンセル（決済済み）がある場合は表示 */}
      {canceledRevenue > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <div className="text-2xl font-bold text-amber-600" data-testid="canceled-revenue">
              ¥{canceledRevenue.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">キャンセル（決済済み）</div>
            <div className="text-xs text-gray-500 mt-1">※不参加/未定に変更済みの決済分</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-600" data-testid="net-revenue">
              ¥{totalRevenue.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">実際の入金総額</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="text-center p-3 bg-cyan-50 rounded-lg">
          <div className="text-2xl font-bold text-cyan-600" data-testid="expected-revenue">
            ¥{expectedRevenue.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">期待売上</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div
            className={`text-2xl font-bold ${capacityExceeded ? "text-red-600" : "text-gray-600"}`}
            data-testid="capacity-exceeded"
          >
            {capacityExceeded ? "定員超過" : "定員内"}
          </div>
          <div className="text-sm text-gray-600">定員状況</div>
        </div>
      </div>

      {/* 詳細な決済情報（返金情報） */}
      {refundedAmount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600" data-testid="refunded-amount">
              ¥{refundedAmount.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">返金済み</div>
          </div>
        </div>
      )}
    </div>
  );
}
