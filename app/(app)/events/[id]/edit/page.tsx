import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

import { ArrowLeft } from "lucide-react";

import { requireCurrentUserForServerComponent } from "@core/auth/auth-utils";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";
import type { Event, EventRow } from "@core/types/event";
import type { AttendanceStatus } from "@core/types/statuses";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { calculateAttendeeCount } from "@core/utils/event-calculations";
import { validateEventId } from "@core/validation/event-id";

import { SinglePageEventEditForm } from "@features/events";
import { getEventPayoutProfileReadiness } from "@features/events/server";

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
  | "payout_profile_id"
  | "invite_token"
  | "canceled_at"
> & {
  attendances: Array<{ id: string; status: AttendanceStatus }>;
};

export default async function EventEditPage(props: EventEditPageProps) {
  const params = await props.params;
  const supabase = await createServerComponentSupabaseClient();
  await requireCurrentUserForServerComponent();

  // IDバリデーション（形式不正のみ404）
  const validation = validateEventId(params.id);
  if (!validation.success) {
    notFound();
  }

  // イベントの取得（RLSで他人イベントは0件として見える）
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
      payout_profile_id,
      invite_token,
      canceled_at,
      attendances(id, status)
    `
    )
    .eq("id", params.id)
    .single()
    .overrideTypes<EventEditQueryRow, { merge: false }>();

  // アクセス拒否は403へ（PGRST301=RLS拒否 / PGRST116=0件）
  if (eventError?.code === "PGRST301" || eventError?.code === "PGRST116" || !eventData) {
    redirect(`/events/${params.id}/forbidden`);
  }
  const event = eventData;

  const attendeeCount = calculateAttendeeCount(event.attendances);

  // Stripe 決済済み参加者の有無を算出
  const { data: stripePaid, error: stripePaidError } = await supabase
    .from("payments")
    .select("id, attendances!inner(event_id)")
    .eq("attendances.event_id", params.id)
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
    redirect(`/events/${params.id}/forbidden?reason=${computedStatus}`);
  }

  const payoutReadiness = await getEventPayoutProfileReadiness(supabase, event.payout_profile_id);
  const canUseOnlinePayments = payoutReadiness.isReady;

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
        <div className="space-y-6">
          {/* 戻るリンク */}
          <div>
            <Link
              href={`/events/${params.id}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              イベント詳細に戻る
            </Link>
          </div>

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
            eventId={params.id}
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
