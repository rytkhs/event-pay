import type { Event } from "@core/types/event";
import type {
  CollectionProgressSummary,
  GetParticipantsResponse,
} from "@core/validation/participant-management";

import type { ParticipantsTableV2Props } from "../participants/components/participants-table-v2/ParticipantsTableV2";
import type { EventManagementQuery } from "../query-params";

import { EventDetailHeader } from "./EventDetailHeader";
import { EventManagementTabsShell } from "./EventManagementTabsShell";
import { EventOverviewTab } from "./EventOverviewTab";
import { EventParticipantsTab } from "./EventParticipantsTab";

const EVENT_MANAGEMENT_TAB_LABELS = {
  overview: "概要",
  participants: "参加者",
} as const;

interface EventManagementPageProps {
  eventId: string;
  eventDetail: Event;
  query: EventManagementQuery;
  collectionSummary: CollectionProgressSummary | null;
  overviewStats: { attending_count: number; maybe_count: number } | null;
  participantsData: GetParticipantsResponse | null;
  deleteMistakenAttendanceAction: ParticipantsTableV2Props["deleteMistakenAttendanceAction"];
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
  deleteMistakenAttendanceAction,
  updateCashStatusAction,
  bulkUpdateCashStatusAction,
}: EventManagementPageProps) {
  return (
    <EventManagementTabsShell
      eventId={eventId}
      initialTab={query.tab}
      headerContent={<EventDetailHeader eventDetail={eventDetail} />}
      tabLabels={EVENT_MANAGEMENT_TAB_LABELS}
      overviewContent={
        <EventOverviewTab
          eventId={eventId}
          eventDetail={eventDetail}
          collectionSummary={collectionSummary}
          stats={overviewStats}
        />
      }
      participantsContent={
        participantsData ? (
          <section aria-label={EVENT_MANAGEMENT_TAB_LABELS.participants}>
            <EventParticipantsTab
              eventId={eventId}
              eventDetail={eventDetail}
              participantsData={participantsData}
              query={query}
              deleteMistakenAttendanceAction={deleteMistakenAttendanceAction}
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
        )
      }
    />
  );
}
