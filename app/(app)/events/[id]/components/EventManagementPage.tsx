"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import type { Event } from "@core/types/event";
import type {
  CollectionProgressSummary,
  GetParticipantsResponse,
} from "@core/validation/participant-management";

import { Tabs, TabsContent } from "@/components/ui/tabs";

import type { ParticipantsTableV2Props } from "../participants/components/participants-table-v2/ParticipantsTableV2";
import {
  type EventManagementQueryPatch,
  buildEventManagementSearchParams,
  parseEventManagementQuery,
} from "../query-params";

import { EventDetailHeader } from "./EventDetailHeader";
import { EventOverviewTab } from "./EventOverviewTab";
import { EventParticipantsTab } from "./EventParticipantsTab";

const EVENT_MANAGEMENT_TAB_LABELS = {
  overview: "概要",
  participants: "参加者管理",
} as const;

interface EventManagementPageProps {
  eventId: string;
  eventDetail: Event;
  collectionSummary: CollectionProgressSummary | null;
  overviewStats: { attending_count: number; maybe_count: number } | null;
  participantsData: GetParticipantsResponse | null;
  searchParams: { [key: string]: string | string[] | undefined };
  updateCashStatusAction: ParticipantsTableV2Props["updateCashStatusAction"];
  bulkUpdateCashStatusAction: ParticipantsTableV2Props["bulkUpdateCashStatusAction"];
}

export function EventManagementPage({
  eventId,
  eventDetail,
  collectionSummary,
  overviewStats,
  participantsData,
  searchParams,
  updateCashStatusAction,
  bulkUpdateCashStatusAction,
}: EventManagementPageProps) {
  const router = useRouter();
  const query = parseEventManagementQuery(searchParams);
  const currentTab = query.tab;
  const [activeTab, setActiveTab] = useState(currentTab);

  // ステートをURLパラメータと同期
  useEffect(() => {
    setActiveTab(currentTab);
  }, [currentTab]);

  const replaceSearchParams = (patch: EventManagementQueryPatch) => {
    const params = buildEventManagementSearchParams(window.location.search, patch);
    const search = params.toString();
    router.replace(`/events/${eventId}${search ? `?${search}` : ""}`, { scroll: false });
  };

  const handleTabChange = (value: string) => {
    if (value !== "overview" && value !== "participants") {
      return;
    }

    setActiveTab(value);
    replaceSearchParams({
      tab: value,
    });
  };

  const handleParticipantsFilterUpdate = (patch: EventManagementQueryPatch) => {
    replaceSearchParams({
      ...patch,
      tab: "participants",
    });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="min-h-screen w-full">
      <EventDetailHeader
        eventDetail={eventDetail}
        activeTab={activeTab}
        tabLabels={EVENT_MANAGEMENT_TAB_LABELS}
      />

      {/* 概要タブコンテンツ */}
      <TabsContent
        value="overview"
        className="mt-0 focus-visible:outline-none"
        aria-label={EVENT_MANAGEMENT_TAB_LABELS.overview}
      >
        <EventOverviewTab
          eventId={eventId}
          eventDetail={eventDetail}
          collectionSummary={collectionSummary}
          stats={overviewStats}
        />
      </TabsContent>

      {/* 参加者管理タブコンテンツ */}
      <TabsContent
        value="participants"
        className="mt-0 focus-visible:outline-none"
        aria-label={EVENT_MANAGEMENT_TAB_LABELS.participants}
      >
        {participantsData ? (
          <EventParticipantsTab
            eventId={eventId}
            eventDetail={eventDetail}
            participantsData={participantsData}
            query={query}
            onUpdateFilters={handleParticipantsFilterUpdate}
            updateCashStatusAction={updateCashStatusAction}
            bulkUpdateCashStatusAction={bulkUpdateCashStatusAction}
          />
        ) : (
          <div className="p-8 text-center text-muted-foreground">読み込み中...</div>
        )}
      </TabsContent>
    </Tabs>
  );
}
