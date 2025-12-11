"use client";

import type { Event } from "@core/types/models";
import type { GetEventPaymentsResponse } from "@core/validation/participant-management";

import { AttentionAlertsCompact } from "./overview/attention-alerts-compact";
import { EventInfoAccordion } from "./overview/event-info-accordion";
import { InviteLinkCard } from "./overview/invite-link-card";
import { KpiCardsGrid } from "./overview/kpi-cards-grid";

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
  const unpaidAmount = paymentsData?.summary?.unpaidAmount ?? 0;
  const isFreeEvent = eventDetail.fee === 0;

  // 基本設定
  const capacity = eventDetail.capacity;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* 1. 招待リンク（最重要CTA） */}
      <InviteLinkCard
        eventId={eventId}
        initialInviteToken={eventDetail.invite_token || undefined}
      />

      {/* 2. KPIカード群（一覧性重視） */}
      <KpiCardsGrid
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

      {/* 3. 注意事項（条件付き表示 - コンパクト） */}
      <AttentionAlertsCompact
        event={eventDetail}
        unpaidCount={unpaidCount}
        unpaidAmount={unpaidAmount}
        attendingCount={attendingCount}
        isFreeEvent={isFreeEvent}
      />

      {/* 4. イベント情報（アコーディオン形式） */}
      <EventInfoAccordion event={eventDetail} />
    </div>
  );
}
