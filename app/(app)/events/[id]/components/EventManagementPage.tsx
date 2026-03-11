import type { Event } from "@core/types/event";
import type {
  CollectionProgressSummary,
  GetParticipantsResponse,
} from "@core/validation/participant-management";

import type { ParticipantsTableV2Props } from "../participants/components/participants-table-v2/ParticipantsTableV2";
import type { EventManagementQuery } from "../query-params";

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
  query: EventManagementQuery;
  collectionSummary: CollectionProgressSummary | null;
  overviewStats: { attending_count: number; maybe_count: number } | null;
  participantsData: GetParticipantsResponse | null;
  overviewHref: string;
  participantsHref: string;
  updateCashStatusAction: ParticipantsTableV2Props["updateCashStatusAction"];
  bulkUpdateCashStatusAction: ParticipantsTableV2Props["bulkUpdateCashStatusAction"];
}

export function EventManagementPage({
  eventId,
  eventDetail,
  query,
  collectionSummary,
  overviewStats,
  participantsData,
  overviewHref,
  participantsHref,
  updateCashStatusAction,
  bulkUpdateCashStatusAction,
}: EventManagementPageProps) {
  return (
    <div className="min-h-screen w-full">
      <EventDetailHeader
        eventDetail={eventDetail}
        activeTab={query.tab}
        overviewHref={overviewHref}
        participantsHref={participantsHref}
        tabLabels={EVENT_MANAGEMENT_TAB_LABELS}
      />

      {query.tab === "overview" ? (
        <EventOverviewTab
          eventId={eventId}
          eventDetail={eventDetail}
          collectionSummary={collectionSummary}
          stats={overviewStats}
        />
      ) : participantsData ? (
        <section aria-label={EVENT_MANAGEMENT_TAB_LABELS.participants}>
          <EventParticipantsTab
            eventId={eventId}
            eventDetail={eventDetail}
            participantsData={participantsData}
            query={query}
            updateCashStatusAction={updateCashStatusAction}
            bulkUpdateCashStatusAction={bulkUpdateCashStatusAction}
          />
        </section>
      ) : (
        <section
          aria-label={EVENT_MANAGEMENT_TAB_LABELS.participants}
          className="p-8 text-center text-muted-foreground"
        >
          読み込み中...
        </section>
      )}
    </div>
  );
}
