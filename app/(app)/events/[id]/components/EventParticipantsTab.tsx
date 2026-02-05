"use client";

import { useMemo, useState } from "react";

import type { Event } from "@core/types/models";
import type { GetParticipantsResponse } from "@core/validation/participant-management";

import {
  ParticipantsTableV2,
  type ParticipantsTableV2Props,
} from "../participants/components/participants-table-v2/ParticipantsTableV2";
import { ParticipantsActionBarV2 } from "../participants/components/ParticipantsActionBarV2";
import { ParticipantsFilterSheet } from "../participants/components/ParticipantsFilterSheet";
import { ParticipantsStatusTabs } from "../participants/components/ParticipantsStatusTabs";

interface EventParticipantsTabProps {
  eventId: string;
  eventDetail: Event;
  participantsData: GetParticipantsResponse | null;
  searchParams: { [key: string]: string | string[] | undefined };
  onUpdateFilters: (newParams: Record<string, string | undefined>) => void;
  updateCashStatusAction: ParticipantsTableV2Props["updateCashStatusAction"];
  bulkUpdateCashStatusAction: ParticipantsTableV2Props["bulkUpdateCashStatusAction"];
}

export function EventParticipantsTab({
  eventId,
  eventDetail,
  participantsData,
  searchParams,
  onUpdateFilters,
  updateCashStatusAction,
  bulkUpdateCashStatusAction,
}: EventParticipantsTabProps) {
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

  // 現在のステータスフィルター
  const activeStatus =
    typeof searchParams.attendance === "string" ? searchParams.attendance : "all";

  const handleStatusChange = (status: string) => {
    onUpdateFilters({
      attendance: status === "all" ? undefined : status,
      page: "1",
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-2 py-4">
      <div className="space-y-4">
        {/* アクションバー + フィルターSheet */}
        <ParticipantsActionBarV2
          eventId={eventId}
          eventDetail={eventDetail}
          searchParams={searchParams}
          onFiltersChange={onUpdateFilters}
          isSelectionMode={isSelectionMode}
          onToggleSelectionMode={() => setIsSelectionMode((prev) => !prev)}
          filterTrigger={
            <ParticipantsFilterSheet
              searchParams={searchParams}
              onFiltersChange={onUpdateFilters}
              isFreeEvent={isFreeEvent}
            />
          }
        />

        {/* ステータスタブ（リスト直上） */}
        <ParticipantsStatusTabs
          counts={statusCounts}
          activeStatus={activeStatus}
          onStatusChange={handleStatusChange}
        />

        {/* 参加者テーブル */}
        <div className="-mx-4 sm:mx-0">
          <ParticipantsTableV2
            eventId={eventId}
            eventFee={eventDetail.fee}
            allParticipants={allParticipants}
            searchParams={searchParams}
            onParamsChange={onUpdateFilters}
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
