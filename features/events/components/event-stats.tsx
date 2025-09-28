import React from "react";

import type { Event, Attendance, Payment } from "@core/types/models";

// 統計表示に必要な最小限のフィールドのみを抽出
type EventStatsAttendanceData = Pick<Attendance, "id" | "status">;
type EventStatsPaymentData = Pick<Payment, "id" | "method" | "amount" | "status">;

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

  // 決済情報をstatus×methodでグループ化（1回のループで全て計算）
  const paymentStats = payments.reduce(
    (acc, payment) => {
      const key = `${payment.status}_${payment.method}`;
      acc[key] = (acc[key] || 0) + payment.amount;
      acc[payment.status] = (acc[payment.status] || 0) + payment.amount;
      acc.total += payment.amount;
      acc.count[payment.status] = (acc.count[payment.status] || 0) + 1;
      return acc;
    },
    {
      total: 0,
      count: {} as Record<string, number>,
    } as Record<string, number> & { total: number; count: Record<string, number> }
  );

  // 売上合計を計算（paid + received + completed）
  const totalRevenue =
    (paymentStats.paid || 0) + (paymentStats.received || 0) + (paymentStats.completed || 0);

  // Stripe決済分を計算
  const stripeRevenue = paymentStats.paid_stripe || 0;

  // 現金決済分を計算
  const cashRevenue = paymentStats.received_cash || 0;

  // 返金済み金額を計算
  const refundedAmount = paymentStats.refunded || 0;

  // 無料イベント完了分を計算
  const completedAmount = paymentStats.completed || 0;

  // 未決済金額を計算
  const pendingAmount = paymentStats.pending || 0;

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
            ¥{totalRevenue.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">売上合計</div>
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

      {/* 詳細な決済情報（返金・完了情報） */}
      {(refundedAmount > 0 || completedAmount > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-slate-600" data-testid="completed-amount">
              ¥{completedAmount.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">無料完了</div>
          </div>
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
