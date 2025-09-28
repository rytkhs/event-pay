"use client";

import { useRouter } from "next/navigation";

import { ArrowLeft, Calendar, MapPin } from "lucide-react";

import { EVENT_STATUS_LABELS } from "@core/types/enums";
import type { Event } from "@core/types/models";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";
import type { GetEventPaymentsResponse } from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { AttentionAlerts } from "./attention-alerts";
import { EventInfoCompact } from "./event-info-compact";
import { QuickActionsGrid } from "./quick-actions-grid";
import { UnifiedEventDashboard } from "./unified-event-dashboard";

interface ModernEventDashboardProps {
  eventId: string;
  eventDetail: Event;
  paymentsData: GetEventPaymentsResponse | null;
  stats: { attending_count: number; maybe_count: number } | null;
}

export function ModernEventDashboard({
  eventId,
  eventDetail,
  paymentsData,
  stats,
}: ModernEventDashboardProps) {
  const router = useRouter();

  // 統計計算
  const attendingCount = stats?.attending_count ?? 0;
  const maybeCount = stats?.maybe_count ?? 0;
  const totalRevenue = paymentsData?.summary?.paidAmount ?? 0;
  const expectedRevenue = eventDetail.fee * attendingCount;
  const unpaidCount = paymentsData?.summary?.unpaidCount ?? 0;
  const isFreeEvent = eventDetail.fee === 0;

  // 基本設定
  const capacity = eventDetail.capacity ?? 0;

  const handleBackToEvents = () => {
    router.push("/events");
  };

  const getStatusBadge = (status: string) => {
    const statusText = EVENT_STATUS_LABELS[status as keyof typeof EVENT_STATUS_LABELS] || status;

    switch (status) {
      case "upcoming":
        return (
          <Badge variant="default" className="text-xs">
            {statusText}
          </Badge>
        );
      case "ongoing":
        return (
          <Badge variant="default" className="text-xs bg-green-100 text-green-800">
            {statusText}
          </Badge>
        );
      case "past":
        return (
          <Badge variant="secondary" className="text-xs">
            {statusText}
          </Badge>
        );
      case "canceled":
        return (
          <Badge variant="destructive" className="text-xs">
            {statusText}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {statusText}
          </Badge>
        );
    }
  };

  const unpaidAmount = paymentsData?.summary?.unpaidAmount ?? 0;

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* コンパクトヘッダー */}
      <div className="bg-white border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleBackToEvents}
              variant="ghost"
              size="sm"
              className="flex-shrink-0 p-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-foreground truncate">
                {sanitizeForEventPay(eventDetail.title)}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {getStatusBadge(eventDetail.status)}

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatUtcToJstByType(eventDetail.date, "standard")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate max-w-[120px]">
                      {sanitizeForEventPay(eventDetail.location)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ - モバイルファースト縦積みレイアウト */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* FAB風クイックアクション */}
        <QuickActionsGrid
          eventId={eventId}
          inviteToken={eventDetail.invite_token || undefined}
          eventStatus={eventDetail.status}
          attendingCount={attendingCount}
        />

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
    </div>
  );
}
