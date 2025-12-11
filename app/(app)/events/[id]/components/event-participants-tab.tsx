"use client";

import { useMemo } from "react";

import type { Event } from "@core/types/models";
import type { GetParticipantsResponse } from "@core/validation/participant-management";

import { ParticipantsActionBarV2 } from "../participants/components/participants-action-bar-v2";
import { ParticipantsFilterSheet } from "../participants/components/participants-filter-sheet";
import { ParticipantsStatusTabs } from "../participants/components/participants-status-tabs";
import { ParticipantsSummaryAlert } from "../participants/components/participants-summary-alert";
import { ParticipantsTableV2 } from "../participants/components/participants-table-v2/participants-table";

interface EventParticipantsTabProps {
  eventId: string;
  eventDetail: Event;
  participantsData: GetParticipantsResponse;
  searchParams: { [key: string]: string | string[] | undefined };
  onUpdateFilters: (newParams: Record<string, string | undefined>) => void;
}

export function EventParticipantsTab({
  eventId,
  eventDetail,
  participantsData,
  searchParams,
  onUpdateFilters,
}: EventParticipantsTabProps) {
  const isFreeEvent = eventDetail.fee === 0;

  // 参加状況の集計（全参加者から計算）
  const statusCounts = useMemo(() => {
    const participants = participantsData.participants;
    return {
      all: participantsData.pagination.total,
      attending: participants.filter((p) => p.status === "attending").length,
      maybe: participants.filter((p) => p.status === "maybe").length,
      not_attending: participants.filter((p) => p.status === "not_attending").length,
    };
  }, [participantsData]);

  // 未払い情報の計算
  const unpaidInfo = useMemo(() => {
    if (isFreeEvent) return { count: 0, amount: 0 };
    const unpaidParticipants = participantsData.participants.filter(
      (p) =>
        p.status === "attending" &&
        p.payment_method &&
        (p.payment_status === "pending" || p.payment_status === "failed")
    );
    return {
      count: unpaidParticipants.length,
      amount: unpaidParticipants.length * eventDetail.fee,
    };
  }, [participantsData, isFreeEvent, eventDetail.fee]);

  // 現在のステータスフィルター
  const activeStatus =
    typeof searchParams.attendance === "string" ? searchParams.attendance : "all";

  const handleStatusChange = (status: string) => {
    onUpdateFilters({
      attendance: status === "all" ? undefined : status,
      page: "1",
    });
  };

  const handleViewUnpaid = () => {
    onUpdateFilters({
      attendance: "attending",
      payment_status: "unpaid",
      page: "1",
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-4">
        {/* アクションバー + フィルターSheet */}
        <ParticipantsActionBarV2
          eventId={eventId}
          eventDetail={eventDetail}
          searchParams={searchParams}
          onFiltersChange={onUpdateFilters}
          filterTrigger={
            <ParticipantsFilterSheet
              searchParams={searchParams}
              onFiltersChange={onUpdateFilters}
              isFreeEvent={isFreeEvent}
            />
          }
        />

        {/* 未払いアラート（有料イベントのみ） */}
        {!isFreeEvent && (
          <ParticipantsSummaryAlert
            unpaidCount={unpaidInfo.count}
            unpaidAmount={unpaidInfo.amount}
            onViewUnpaid={handleViewUnpaid}
          />
        )}

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
            initialData={participantsData}
            searchParams={searchParams}
            onParamsChange={onUpdateFilters}
          />
        </div>
      </div>
    </div>
  );
}
