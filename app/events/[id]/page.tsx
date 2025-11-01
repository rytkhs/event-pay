import { notFound, redirect } from "next/navigation";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { getCurrentUser } from "@core/auth/auth-utils";
import { createCachedActions } from "@core/utils/cache-helpers";

import {
  getEventDetailAction,
  getEventPaymentsAction,
  getEventStatsAction,
} from "@features/events";

import { ModernEventDashboard } from "./components/modern-event-dashboard";

interface EventDetailPageProps {
  params: {
    id: string;
  };
}

// キャッシュ処理を統一（軽量化）
const cachedActions = createCachedActions({
  getEventDetail: getEventDetailAction,
  getEventPayments: getEventPaymentsAction,
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

    // 主催者の場合のみダッシュボード用データを取得
    let paymentsData: Awaited<ReturnType<typeof cachedActions.getEventPayments>> | null = null;
    let stats: { attending_count: number; maybe_count: number } | null = null;

    if (isOrganizer) {
      try {
        // ダッシュボード用の軽量データを並列取得
        const [payRes, statsRes] = await Promise.all([
          cachedActions.getEventPayments(params.id),
          cachedActions.getEventStats(params.id),
        ]);

        paymentsData = payRes;
        if (statsRes?.success) {
          stats = statsRes.data as any;
        }
      } catch (_) {
        // エラーが発生してもページ表示は継続
      }
    }

    return (
      <ModernEventDashboard
        eventId={params.id}
        eventDetail={eventDetail}
        paymentsData={paymentsData}
        stats={stats}
      />
    );
  } catch (error) {
    // 予期しないエラーの場合は500エラーとして処理
    throw error;
  }
}

// ページメタデータ生成（動的タイトル設定）
export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  try {
    const eventDetailResult = await cachedActions.getEventDetail(params.id);
    if (!eventDetailResult.success) {
      return {
        title: "イベント詳細 - みんなの集金",
        description: "イベントの詳細情報",
        openGraph: {
          title: "イベント詳細 - みんなの集金",
          description: "イベントの詳細情報",
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title: "イベント詳細 - みんなの集金",
          description: "イベントの詳細情報",
        },
      };
    }

    const eventDetail = eventDetailResult.data;
    const ogImageUrl = "/og/event-default.png";

    return {
      title: `${eventDetail.title} - みんなの集金`,
      description: `${eventDetail.title}の詳細情報と参加者管理`,
      openGraph: {
        title: `${eventDetail.title} - みんなの集金`,
        description: `${eventDetail.title}の詳細情報と参加者管理`,
        type: "website",
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: `${eventDetail.title} - みんなの集金`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: `${eventDetail.title} - みんなの集金`,
        description: `${eventDetail.title}の詳細情報と参加者管理`,
        images: [ogImageUrl],
      },
    };
  } catch {
    return {
      title: "イベント詳細 - みんなの集金",
      description: "イベントの詳細情報",
      openGraph: {
        title: "イベント詳細 - みんなの集金",
        description: "イベントの詳細情報",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: "イベント詳細 - みんなの集金",
        description: "イベントの詳細情報",
      },
    };
  }
}
