"use client";

import { useState } from "react";

import type { Event } from "@core/types/models";
import type { GetParticipantsResponse } from "@core/validation/participant-management";

import { ParticipantsActionBar } from "../participants/components/participants-action-bar";
import { ParticipantsFilters } from "../participants/components/participants-filters";
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
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-6">
        {/* アクションバー */}
        <ParticipantsActionBar
          eventId={eventId}
          eventDetail={eventDetail}
          onFiltersToggle={() => setFiltersExpanded(!filtersExpanded)}
          filtersExpanded={filtersExpanded}
          searchParams={searchParams}
          onFiltersChange={onUpdateFilters}
        />

        {/* フィルター（展開可能） */}
        {filtersExpanded && (
          <ParticipantsFilters
            searchParams={searchParams}
            onFiltersChange={onUpdateFilters}
            isFreeEvent={eventDetail.fee === 0}
          />
        )}

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
