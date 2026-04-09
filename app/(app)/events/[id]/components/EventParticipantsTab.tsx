"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import type { Event } from "@core/types/event";
import type { GetParticipantsResponse } from "@core/validation/participant-management";

import {
  ParticipantsTableV2,
  type ParticipantsTableV2Props,
} from "../participants/components/participants-table-v2/ParticipantsTableV2";
import { ParticipantsActionBarV2 } from "../participants/components/ParticipantsActionBarV2";
import { ParticipantsActiveFilters } from "../participants/components/ParticipantsActiveFilters";
import { ParticipantsFilterSheet } from "../participants/components/ParticipantsFilterSheet";
import { ParticipantsStatusTabs } from "../participants/components/ParticipantsStatusTabs";
import type {
  EventManagementQuery,
  ParticipantAttendanceFilter,
  EventManagementQueryPatch,
} from "../query-params";
import { buildEventManagementSearchParams, parseEventManagementQuery } from "../query-params";

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
  const [optimisticQuery, setOptimisticQuery] = useState(query);

  useEffect(() => {
    setOptimisticQuery(query);
  }, [query]);

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

  const handleFiltersUpdate = useCallback(
    (patch: EventManagementQueryPatch) => {
      const params = buildEventManagementSearchParams(window.location.search, {
        ...patch,
        tab: "participants",
      });
      const search = params.toString();

      setOptimisticQuery((current) => {
        const nextRawSearchParams = Object.fromEntries(params.entries());
        const nextQuery = parseEventManagementQuery(nextRawSearchParams);

        // ナビゲーション完了前でも UI が最新のフィルター状態を反映するようにする
        return { ...current, ...nextQuery };
      });

      router.replace(`/events/${eventId}${search ? `?${search}` : ""}`, { scroll: false });
    },
    [eventId, router]
  );

  const handleStatusChange = (status: string) => {
    handleFiltersUpdate({
      attendance: status as ParticipantAttendanceFilter,
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-2 py-3 sm:px-3">
      <div className="flex flex-col gap-3">
        <div className="sticky -mx-3 top-[calc(var(--app-mobile-header-height)+var(--event-management-tabbar-height)-0.2rem)] z-10 sm:-mx-2 md:top-[calc(3.5rem+var(--event-management-tabbar-height)+0.03rem)]">
          <ParticipantsActionBarV2
            eventId={eventId}
            eventDetail={eventDetail}
            query={optimisticQuery}
            onFiltersChange={handleFiltersUpdate}
            isSelectionMode={isSelectionMode}
            onToggleSelectionMode={() => setIsSelectionMode((prev) => !prev)}
            statusTabs={
              <ParticipantsStatusTabs
                counts={statusCounts}
                activeStatus={optimisticQuery.attendance}
                onStatusChange={handleStatusChange}
                className="pb-0.5"
              />
            }
            activeFilters={
              <ParticipantsActiveFilters
                query={optimisticQuery}
                onFiltersChange={handleFiltersUpdate}
                isFreeEvent={isFreeEvent}
              />
            }
            filterTrigger={
              <ParticipantsFilterSheet
                query={optimisticQuery}
                onFiltersChange={handleFiltersUpdate}
                isFreeEvent={isFreeEvent}
              />
            }
          />
        </div>

        <div className="-mx-2 sm:mx-0">
          <ParticipantsTableV2
            eventId={eventId}
            eventFee={eventDetail.fee}
            allParticipants={allParticipants}
            query={optimisticQuery}
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
