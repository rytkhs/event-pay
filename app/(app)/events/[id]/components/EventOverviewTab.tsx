"use client";

import type { Event } from "@core/types/event";
import type { GetEventPaymentsResponse } from "@core/validation/participant-management";

import { EventInfo } from "./overview/EventInfo";
import { InviteLinkCard } from "./overview/InviteLinkCard";
import { KpiCardsGrid } from "./overview/KpiCardsGrid";

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
  const isFreeEvent = eventDetail.fee === 0;

  // 基本設定
  const capacity = eventDetail.capacity;

  return (
    <div className="max-w-7xl mx-auto px-2 py-6 space-y-5">
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
        isFreeEvent={isFreeEvent}
      />

      {/* 4. イベント情報（一覧形式） */}
      <EventInfo event={eventDetail} />
    </div>
  );
}
