import { getEventDetailAction } from "@/app/events/actions/get-event-detail";
import { getEventAttendancesAction } from "@/app/events/actions/get-event-attendances";
import { getEventPaymentsAction } from "@/app/events/actions/get-event-payments";
import { getEventParticipantsAction } from "@/app/events/actions/get-event-participants";
import { EventDetail } from "@features/events/components/event-detail";
import { EventActions } from "@features/events/components/event-actions";
import { InviteLink } from "@features/events/components/invite-link";
import { ParticipantsManagement } from "@features/events/components/participants-management";
import { notFound, redirect } from "next/navigation";
import { sanitizeEventDescription } from "@core/utils/sanitize";
import { getCurrentUser } from "@core/auth/auth-utils";
import { createCachedActions } from "@core/utils/cache-helpers";

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
  getEventParticipants: getEventParticipantsAction,
});

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  try {
    if (!params?.id) {
      notFound();
    }

    const eventDetailResult = await cachedActions.getEventDetail(params.id);

    if (!eventDetailResult.success) {
      // エラーコードに基づいて適切な処理
      if (eventDetailResult.code === "EVENT_NOT_FOUND") {
        notFound();
      }
      if (eventDetailResult.code === "EVENT_ACCESS_DENIED") {
        redirect("/events/" + params.id + "/forbidden");
      }
      if (eventDetailResult.code === "EVENT_INVALID_ID") {
        notFound();
      }
      // その他のエラーは500エラーとして処理
      throw new Error(eventDetailResult.error);
    }

    const eventDetail = eventDetailResult.data;

    // 現在のユーザーを取得して主催者かどうか判定
    const currentUser = await getCurrentUser();
    const isOrganizer = currentUser && currentUser.id === eventDetail.created_by;

    // 主催者の場合のみ統計データと参加者データを取得
    let attendances: Awaited<ReturnType<typeof cachedActions.getEventAttendances>> = [];
    let paymentsData: Awaited<ReturnType<typeof cachedActions.getEventPayments>> | null = null;
    let participantsData: Awaited<ReturnType<typeof cachedActions.getEventParticipants>> | null =
      null;

    if (isOrganizer) {
      try {
        // 基本的な統計データ
        [attendances, paymentsData] = await Promise.all([
          cachedActions.getEventAttendances(params.id),
          cachedActions.getEventPayments(params.id),
        ]);

        // 参加者詳細データ（デフォルトパラメータで初期データを取得）
        participantsData = await cachedActions.getEventParticipants({
          eventId: params.id,
          search: undefined,
          attendanceStatus: undefined,
          paymentMethod: undefined,
          paymentStatus: undefined,
          sortField: "updated_at",
          sortOrder: "desc",
          page: 1,
          limit: 50,
        });
      } catch (_) {
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

          {/* 主催者のみに参加者管理セクションを表示 */}
          {isOrganizer && participantsData && paymentsData && (
            <ParticipantsManagement
              eventId={params.id}
              eventData={eventDetail}
              initialAttendances={attendances}
              initialPaymentsData={paymentsData}
              initialParticipantsData={participantsData}
            />
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
    // 予期しないエラーの場合は500エラーとして処理
    throw error;
  }
}

// ページメタデータ生成（動的タイトル設定）
export async function generateMetadata({ params }: EventDetailPageProps) {
  try {
    const eventDetailResult = await cachedActions.getEventDetail(params.id);
    if (!eventDetailResult.success) {
      return {
        title: "イベント詳細 - EventPay",
        description: "イベントの詳細情報",
      };
    }

    const eventDetail = eventDetailResult.data;
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
