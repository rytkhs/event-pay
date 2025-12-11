"use client";

import type { Event } from "@core/types/models";
import type { GetEventPaymentsResponse } from "@core/validation/participant-management";

import { AttentionAlerts } from "./attention-alerts";
import { EventInfoCompact } from "./event-info-compact";
import { QuickActionsGrid } from "./quick-actions-grid";
import { UnifiedEventDashboard } from "./unified-event-dashboard";

interface EventOverviewTabProps {
  eventId: string;
  eventDetail: Event;
  paymentsData: GetEventPaymentsResponse | null;
  stats: { attending_count: number; maybe_count: number } | null;
}

export function EventOverviewTab({
  eventId,
  eventDetail,
  paymentsData,
  stats,
}: EventOverviewTabProps) {
  // 統計計算
  const attendingCount = stats?.attending_count ?? 0;
  const maybeCount = stats?.maybe_count ?? 0;
  const totalRevenue = paymentsData?.summary?.paidAmount ?? 0;
  const expectedRevenue = eventDetail.fee * attendingCount;
  const unpaidCount = paymentsData?.summary?.unpaidCount ?? 0;
  // const isFreeEvent = eventDetail.fee === 0; // Assuming this is needed for dashboard, otherwise just calculation
  const isFreeEvent = eventDetail.fee === 0;

  // 基本設定
  const capacity = eventDetail.capacity;
  const unpaidAmount = paymentsData?.summary?.unpaidAmount ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* クイックアクション */}
      <QuickActionsGrid eventId={eventId} inviteToken={eventDetail.invite_token || undefined} />

      {/* 統合ダッシュボード */}
      <UnifiedEventDashboard
        attendingCount={attendingCount}
        capacity={capacity}
        maybeCount={maybeCount}
        totalRevenue={totalRevenue}
        expectedRevenue={expectedRevenue}
        unpaidCount={unpaidCount}
        unpaidAmount={unpaidAmount}
        isFreeEvent={isFreeEvent}
        paymentsData={paymentsData}
      />

      {/* 要注意事項（条件に基づいて表示） */}
      <AttentionAlerts
        event={eventDetail}
        unpaidCount={unpaidCount}
        unpaidAmount={unpaidAmount}
        attendingCount={attendingCount}
        isFreeEvent={isFreeEvent}
      />

      {/* イベント基本情報 */}
      <EventInfoCompact event={eventDetail} />
    </div>
  );
}
