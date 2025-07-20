import { getEventDetailAction } from "@/app/events/actions/get-event-detail";
import { getEventAttendancesAction } from "@/app/events/actions/get-event-attendances";
import { getEventPaymentsAction } from "@/app/events/actions/get-event-payments";
import { EventDetail } from "@/components/events/event-detail";
import { EventActions } from "@/components/events/event-actions";
import { InviteLink } from "@/components/events/invite-link";
import { EventStats } from "@/components/events/event-stats";
import { notFound, redirect } from "next/navigation";
import { sanitizeEventDescription } from "@/lib/utils/sanitize";
import { getCurrentUser } from "@/lib/auth/auth-utils";
import { createCachedActions } from "@/lib/utils/cache-helpers";

interface EventDetailPageProps {
  params: {
    id: string;
  };
}

// キャッシュ処理を統一
const cachedActions = createCachedActions({
  getEventDetail: getEventDetailAction,
  getEventAttendances: getEventAttendancesAction,
  getEventPayments: getEventPaymentsAction,
});

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  try {
    if (!params?.id) {
      notFound();
    }

    const eventDetail = await cachedActions.getEventDetail(params.id);

    if (!eventDetail) {
      notFound();
    }

    // 現在のユーザーを取得して主催者かどうか判定
    const currentUser = await getCurrentUser();
    const isOrganizer = currentUser && currentUser.id === eventDetail.organizer_id;

    // 主催者の場合のみ統計データを取得
    let attendances: any[] = [];
    let payments: any[] = [];

    if (isOrganizer) {
      try {
        [attendances, payments] = await Promise.all([
          cachedActions.getEventAttendances(params.id),
          cachedActions.getEventPayments(params.id),
        ]);
      } catch (error) {
        console.error("Failed to fetch event statistics data:", error);
        // エラーが発生してもページ表示は継続
      }
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">イベント詳細</h1>
            </div>
            <EventActions eventId={params.id} />
          </div>

          <EventDetail event={eventDetail} />

          {/* 主催者のみにイベント統計を表示 */}
          {isOrganizer && (
            <EventStats eventData={eventDetail} attendances={attendances} payments={payments} />
          )}

          {/* 主催者のみに招待リンクを表示 */}
          {isOrganizer && (
            <InviteLink
              eventId={params.id}
              initialInviteToken={eventDetail.invite_token || undefined}
            />
          )}
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found") {
        notFound();
      }
      if (error.message === "Access denied") {
        redirect("/events/" + params.id + "/forbidden");
      }
      if (error.message === "Invalid event ID format") {
        notFound();
      }
    }
    throw error;
  }
}

// ページメタデータ生成（動的タイトル設定）
export async function generateMetadata({ params }: EventDetailPageProps) {
  try {
    const eventDetail = await cachedActions.getEventDetail(params.id);
    if (!eventDetail) {
      return {
        title: "イベント詳細 - EventPay",
        description: "イベントの詳細情報",
      };
    }
    return {
      title: `${eventDetail.title} - EventPay`,
      description: sanitizeEventDescription(
        eventDetail.description || `${eventDetail.title}の詳細情報`
      ),
    };
  } catch {
    return {
      title: "イベント詳細 - EventPay",
      description: "イベントの詳細情報",
    };
  }
}
