"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import type { Event } from "@core/types/event";
import type { GetParticipantsResponse } from "@core/validation/participant-management";

import {
  ParticipantsTableV2,
  type ParticipantsTableV2Props,
} from "../participants/components/participants-table-v2/ParticipantsTableV2";
import { ParticipantsActionBarV2 } from "../participants/components/ParticipantsActionBarV2";
import { ParticipantsFilterSheet } from "../participants/components/ParticipantsFilterSheet";
import { ParticipantsStatusTabs } from "../participants/components/ParticipantsStatusTabs";
import type {
  EventManagementQuery,
  ParticipantAttendanceFilter,
  EventManagementQueryPatch,
} from "../query-params";
import { buildEventManagementSearchParams } from "../query-params";

interface EventParticipantsTabProps {
  eventId: string;
  eventDetail: Event;
  participantsData: GetParticipantsResponse | null;
  query: EventManagementQuery;
  updateCashStatusAction: ParticipantsTableV2Props["updateCashStatusAction"];
  bulkUpdateCashStatusAction: ParticipantsTableV2Props["bulkUpdateCashStatusAction"];
}

export function EventParticipantsTab({
  eventId,
  eventDetail,
  participantsData,
  query,
  updateCashStatusAction,
  bulkUpdateCashStatusAction,
}: EventParticipantsTabProps) {
  const router = useRouter();
  const isFreeEvent = eventDetail.fee === 0;

  // 選択モード（一括操作用）の状態管理
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // 全参加者データ
  const allParticipants = useMemo(() => participantsData?.participants ?? [], [participantsData]);

  // 参加状況の集計（全参加者から計算 - フィルター前のデータを使用）
  const statusCounts = useMemo(() => {
    return {
      all: allParticipants.length,
      attending: allParticipants.filter((p) => p.status === "attending").length,
      maybe: allParticipants.filter((p) => p.status === "maybe").length,
      not_attending: allParticipants.filter((p) => p.status === "not_attending").length,
    };
  }, [allParticipants]);

  const handleFiltersUpdate = (patch: EventManagementQueryPatch) => {
    const params = buildEventManagementSearchParams(window.location.search, {
      ...patch,
      tab: "participants",
    });
    const search = params.toString();

    router.replace(`/events/${eventId}${search ? `?${search}` : ""}`, { scroll: false });
  };

  const handleStatusChange = (status: string) => {
    handleFiltersUpdate({
      attendance: status as ParticipantAttendanceFilter,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-2 py-2">
      <div className="flex flex-col gap-3">
        {/* スティッキーヘッダーグループ: アクションバー + ステータスタブ */}
        <div className="sticky top-[calc(var(--app-mobile-header-height)+var(--event-management-tabbar-height))] z-10 -mx-2 flex flex-col gap-3 border-b border-border/40 bg-background/95 px-2 pb-3 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:top-[calc(3.5rem+var(--event-management-tabbar-height))]">
          {/* アクションバー + フィルターSheet */}
          <ParticipantsActionBarV2
            eventId={eventId}
            eventDetail={eventDetail}
            query={query}
            onFiltersChange={handleFiltersUpdate}
            isSelectionMode={isSelectionMode}
            onToggleSelectionMode={() => setIsSelectionMode((prev) => !prev)}
            filterTrigger={
              <ParticipantsFilterSheet
                query={query}
                onFiltersChange={handleFiltersUpdate}
                isFreeEvent={isFreeEvent}
              />
            }
          />

          {/* ステータスタブ（リスト直上） */}
          <ParticipantsStatusTabs
            counts={statusCounts}
            activeStatus={query.attendance}
            onStatusChange={handleStatusChange}
          />
        </div>

        {/* 参加者テーブル */}
        <div className="-mx-4 sm:mx-0">
          <ParticipantsTableV2
            eventId={eventId}
            eventFee={eventDetail.fee}
            allParticipants={allParticipants}
            query={query}
            onParamsChange={handleFiltersUpdate}
            updateCashStatusAction={updateCashStatusAction}
            bulkUpdateCashStatusAction={bulkUpdateCashStatusAction}
            isSelectionMode={isSelectionMode}
            onSelectionModeChange={setIsSelectionMode}
          />
        </div>
      </div>
    </div>
  );
}
