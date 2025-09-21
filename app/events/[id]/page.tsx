import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@core/auth/auth-utils";
import { createCachedActions } from "@core/utils/cache-helpers";

import {
  getEventDetailAction,
  getEventParticipantsAction,
  getEventPaymentsAction,
  getEventStatsAction,
} from "@features/events";

import { ModernEventDetailPage } from "./components/modern-event-detail-page";

interface EventDetailPageProps {
  params: {
    id: string;
  };
}

// キャッシュ処理を統一
const cachedActions = createCachedActions({
  getEventDetail: getEventDetailAction,
  getEventPayments: getEventPaymentsAction,
  getEventParticipants: getEventParticipantsAction,
  getEventStats: getEventStatsAction,
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
        redirect(`/events/${params.id}/forbidden`);
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
    let paymentsData: Awaited<ReturnType<typeof cachedActions.getEventPayments>> | null = null;
    let participantsData: Awaited<ReturnType<typeof cachedActions.getEventParticipants>> | null =
      null;

    let stats: { attending_count: number; maybe_count: number } | null = null;

    if (isOrganizer) {
      try {
        // 基本的な統計データ
        const [payRes, statsRes] = await Promise.all([
          cachedActions.getEventPayments(params.id),
          cachedActions.getEventStats(params.id),
        ]);
        paymentsData = payRes;
        if (statsRes?.success) {
          stats = statsRes.data as any;
        }

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
      <ModernEventDetailPage
        eventId={params.id}
        eventDetail={eventDetail}
        paymentsData={paymentsData}
        participantsData={participantsData}
        stats={stats}
      />
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
        title: "イベント詳細 - みんなの集金",
        description: "イベントの詳細情報",
      };
    }

    const eventDetail = eventDetailResult.data;
    return {
      title: `${eventDetail.title} - みんなの集金`,
      description: `${eventDetail.title}の詳細情報と参加者管理`,
    };
  } catch {
    return {
      title: "イベント詳細 - みんなの集金",
      description: "イベントの詳細情報",
    };
  }
}
