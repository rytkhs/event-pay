"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import type { Event } from "@core/types/models";
import type {
  GetParticipantsResponse,
  GetEventPaymentsResponse,
} from "@core/validation/participant-management";

import { ParticipantsActionBar } from "./participants-action-bar";
import { ParticipantsFilters } from "./participants-filters";
import { ParticipantsHeader } from "./participants-header";
import { ParticipantsStatusCards } from "./participants-status-cards";
import { ParticipantsTableEnhanced } from "./participants-table-enhanced";

interface ParticipantsManagementLayoutProps {
  eventId: string;
  eventDetail: Event;
  participantsData: GetParticipantsResponse;
  paymentsData: GetEventPaymentsResponse;
  searchParams: { [key: string]: string | string[] | undefined };
}

export function ParticipantsManagementLayout({
  eventId,
  eventDetail,
  participantsData,
  paymentsData,
  searchParams,
}: ParticipantsManagementLayoutProps) {
  const router = useRouter();
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // 統計計算
  const attendingCount = participantsData.participants.filter(
    (p) => p.status === "attending"
  ).length;
  const totalRevenue = paymentsData.summary.paidAmount;
  const unpaidCount = paymentsData.summary.unpaidCount;
  const completionRate =
    paymentsData.summary.totalPayments > 0
      ? Math.round((paymentsData.summary.paidCount / paymentsData.summary.totalPayments) * 100)
      : 0;

  const handleBackToEvent = () => {
    router.push(`/events/${eventId}`);
  };

  const handleUpdateFilters = (newParams: Record<string, string | undefined>) => {
    const params = new URLSearchParams();

    // 既存のパラメータを保持
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value && typeof value === "string") {
        params.set(key, value);
      }
    });

    // 新しいパラメータを適用
    Object.entries(newParams).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    // ページを1にリセット（フィルター変更時）
    if (Object.keys(newParams).some((key) => key !== "page")) {
      params.set("page", "1");
    }

    const queryString = params.toString();
    const url = queryString ? `?${queryString}` : "";
    router.push(`/events/${eventId}/participants${url}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          {/* ヘッダー */}
          <ParticipantsHeader eventDetail={eventDetail} onBackClick={handleBackToEvent} />

          {/* ステータスカード */}
          <ParticipantsStatusCards
            attendingCount={attendingCount}
            capacity={eventDetail.capacity}
            totalRevenue={totalRevenue}
            unpaidCount={unpaidCount}
            completionRate={completionRate}
          />

          {/* アクションバー */}
          <ParticipantsActionBar
            eventId={eventId}
            eventDetail={eventDetail}
            onFiltersToggle={() => setFiltersExpanded(!filtersExpanded)}
            filtersExpanded={filtersExpanded}
          />

          {/* フィルター（展開可能） */}
          {filtersExpanded && (
            <ParticipantsFilters
              searchParams={searchParams}
              onFiltersChange={handleUpdateFilters}
              isFreeEvent={eventDetail.fee === 0}
            />
          )}

          {/* 参加者テーブル */}
          <ParticipantsTableEnhanced
            eventId={eventId}
            eventFee={eventDetail.fee}
            participantsData={participantsData}
            paymentsData={paymentsData}
            searchParams={searchParams}
            onFiltersChange={handleUpdateFilters}
          />
        </div>
      </div>
    </div>
  );
}
