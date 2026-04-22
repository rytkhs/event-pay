import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

import { requireNonEmptyCommunityWorkspaceForServerComponent } from "@core/community/app-workspace";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";
import type { Event, EventRow } from "@core/types/event";
import type { AttendanceStatus } from "@core/types/statuses";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { calculateAttendeeCount } from "@core/utils/event-calculations";

import { SinglePageEventEditForm } from "@features/events";
import {
  getOwnedEventContextForCurrentCommunity,
  resolveEventStripePayoutProfile,
} from "@features/events/server";

import { updateEventAction } from "./actions";
import { EventDangerZone } from "./components/EventDangerZone";

interface EventEditPageProps {
  params: Promise<{
    id: string;
  }>;
}

type EventEditQueryRow = Pick<
  EventRow,
  | "id"
  | "title"
  | "description"
  | "location"
  | "date"
  | "fee"
  | "capacity"
  | "payment_methods"
  | "registration_deadline"
  | "payment_deadline"
  | "allow_payment_after_deadline"
  | "grace_period_days"
  | "created_at"
  | "updated_at"
  | "created_by"
  | "community_id"
  | "payout_profile_id"
  | "invite_token"
  | "canceled_at"
> & {
  attendances: Array<{ id: string; status: AttendanceStatus }>;
};

export default async function EventEditPage(props: EventEditPageProps) {
  const params = await props.params;
  const workspace = await requireNonEmptyCommunityWorkspaceForServerComponent();
  const currentCommunity = workspace.currentCommunity;
  if (!currentCommunity) {
    notFound();
  }

  const supabase = await createServerComponentSupabaseClient();

  const accessResult = await getOwnedEventContextForCurrentCommunity(
    supabase,
    params.id,
    currentCommunity.id
  );

  if (!accessResult.success) {
    if (
      accessResult.error.code === "EVENT_INVALID_ID" ||
      accessResult.error.code === "EVENT_NOT_FOUND"
    ) {
      notFound();
    }
    if (accessResult.error.code === "EVENT_ACCESS_DENIED") {
      redirect(`/events/${params.id}/forbidden`);
    }
    throw accessResult.error;
  }

  const accessContext = accessResult.data;
  if (!accessContext) {
    notFound();
  }
  const eventId = accessContext.id;

  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select(
      `
      id,
      title,
      description,
      location,
      date,
      fee,
      capacity,
      payment_methods,
      registration_deadline,
      payment_deadline,
      allow_payment_after_deadline,
      grace_period_days,
      created_at,
      updated_at,
      created_by,
      community_id,
      payout_profile_id,
      invite_token,
      canceled_at,
      attendances(id, status)
    `
    )
    .eq("id", eventId)
    .single()
    .overrideTypes<EventEditQueryRow, { merge: false }>();

  if (eventError || !eventData) {
    notFound();
  }
  const event = eventData;

  const attendeeCount = calculateAttendeeCount(event.attendances);

  // Stripe 集金済み参加者の有無を算出
  const { data: stripePaid, error: stripePaidError } = await supabase
    .from("payments")
    .select("id, attendances!inner(event_id)")
    .eq("attendances.event_id", eventId)
    .eq("method", "stripe")
    .in("status", ["paid", "refunded"])
    .limit(1);

  // 取得エラー時はフェイルクローズ（true 扱い）
  const hasStripePaid = stripePaidError ? true : (stripePaid?.length ?? 0) > 0;
  // 算出ステータスを付与
  const computedStatus = deriveEventStatus(event.date, event.canceled_at ?? null);
  const eventForForm: Event = { ...event, status: computedStatus };

  // 開催済み・キャンセル済みイベントの編集禁止チェック
  if (computedStatus === "past" || computedStatus === "canceled") {
    redirect(`/events/${eventId}/forbidden?reason=${computedStatus}`);
  }

  const payoutResolution = await resolveEventStripePayoutProfile(supabase, {
    currentCommunityId: currentCommunity.id,
    eventPayoutProfileId: event.payout_profile_id,
  });
  const canUseOnlinePayments = payoutResolution.isReady;

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
        <div className="space-y-6">
          {/* 編集フォーム（シングルページ版） */}
          <SinglePageEventEditForm
            event={eventForForm}
            attendeeCount={attendeeCount}
            hasStripePaid={hasStripePaid}
            canUseOnlinePayments={canUseOnlinePayments}
            updateEventAction={updateEventAction}
          />

          {/* 危険な操作（削除・中止） */}
          <EventDangerZone
            eventId={eventId}
            eventTitle={event.title}
            eventStatus={computedStatus}
          />
        </div>
      </div>
    </div>
  );
}

export function generateMetadata() {
  return {
    title: "イベント編集 - みんなの集金",
    description: "イベント情報の編集画面",
  };
}
