import { notFound, redirect } from "next/navigation";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { getCurrentUser } from "@core/auth/auth-utils";
import { logger } from "@core/logging/app-logger";
import { createCachedActions } from "@core/utils/cache-helpers";

import {
  getEventDetailAction,
  getEventParticipantsAction,
  getEventPaymentsAction,
  getEventStatsAction,
} from "@features/events";

import { EventManagementPage } from "./components/event-management-page";

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
  getEventParticipants: getEventParticipantsAction,
});

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  try {
    if (!params?.id) {
      notFound();
    }

    // 基本データ（詳細）取得
    const eventDetailResult = await cachedActions.getEventDetail(params.id);

    if (!eventDetailResult.success) {
      if (eventDetailResult.code === "EVENT_NOT_FOUND") {
        notFound();
      }
      if (eventDetailResult.code === "EVENT_ACCESS_DENIED") {
        redirect(`/events/${params.id}/forbidden`);
      }
      if (eventDetailResult.code === "EVENT_INVALID_ID") {
        notFound();
      }
      throw new Error(eventDetailResult.error);
    }

    const eventDetail = eventDetailResult.data;

    // 現在のユーザーを取得して主催者かどうか判定
    const currentUser = await getCurrentUser();
    const isOrganizer = currentUser && currentUser.id === eventDetail.created_by;

    if (!isOrganizer) {
      // 主催者でない場合は権限エラーページへ（プレビューは /guest/... で行うため）
      redirect(`/events/${params.id}/forbidden`);
    }

    // 検索パラメータの処理
    const tab = typeof searchParams.tab === "string" ? searchParams.tab : "overview";
    const page = searchParams.page ? parseInt(String(searchParams.page), 10) : 1;
    const limit = searchParams.limit ? parseInt(String(searchParams.limit), 10) : 50;
    const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
    const attendanceStatus =
      typeof searchParams.attendance === "string" ? searchParams.attendance : undefined;
    const paymentMethod =
      typeof searchParams.payment_method === "string" ? searchParams.payment_method : undefined;
    const paymentStatus =
      typeof searchParams.payment_status === "string" ? searchParams.payment_status : undefined;

    // sort logic
    const isSmart = typeof searchParams.smart === "string";
    const sortField = isSmart
      ? ("updated_at" as const)
      : typeof searchParams.sort === "string"
        ? searchParams.sort
        : "created_at";
    const sortOrder = searchParams.order === "asc" ? "asc" : "desc";

    // 必要なデータを並列取得
    // OverviewタブでもPaymentsとStatsは必要
    // ParticipantsタブではParticipantsデータが必要

    const promises: [
      Promise<any>, // Payments
      Promise<any>, // Stats
      Promise<any>, // Participants
    ] = [
      cachedActions.getEventPayments(params.id),
      cachedActions.getEventStats(params.id),
      // 参加者データは常に取得しておいても良いが、パフォーマンス重視なら分岐する
      // 今回はタブ遷移の高速化のため、あるいはデータ依存関係が低いため
      // タブがparticipantsの場合のみ重いParticipants fetchを行う戦略も可。
      // しかし、タブ切り替え時のUX向上のためサーバー側で全部取ってしまうのも手。
      // ここでは、明示的にタブがoverview以外なら取得、あるいはoverviewでも
      // 裏でキャッシュに乗せる意味で取得してもよいが、一旦シンプルに分岐なしで取得するか、
      // 負荷軽減のため参加者タブのみ取得するか。
      // 「参加者管理」が重くなる可能性を考慮し、tab=participantsの時のみfetchする形をとる。
      tab === "participants"
        ? cachedActions.getEventParticipants({
            eventId: params.id,
            page,
            limit,
            search,
            attendanceStatus: attendanceStatus as any,
            paymentMethod: paymentMethod as any,
            paymentStatus: paymentStatus as any,
            sortField: sortField as any,
            sortOrder,
          })
        : Promise.resolve(null),
    ];

    const [paymentsRes, statsRes, participantsRes] = await Promise.all(promises);

    let stats: { attending_count: number; maybe_count: number } | null = null;
    if (statsRes?.success) {
      stats = statsRes.data;
    }

    return (
      <EventManagementPage
        eventId={params.id}
        eventDetail={eventDetail}
        paymentsData={paymentsRes}
        overviewStats={stats}
        participantsData={participantsRes}
        searchParams={searchParams}
      />
    );
  } catch (error) {
    logger.error("Event management page error", {
      tag: "event-management-page",
      event_id: params?.id,
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ページメタデータ生成（動的タイトル設定）
export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  try {
    const eventDetailResult = await cachedActions.getEventDetail(params.id);
    if (!eventDetailResult.success) {
      return {
        title: "イベント詳細",
        description: "イベントの詳細情報",
        openGraph: {
          title: "イベント詳細",
          description: "イベントの詳細情報",
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title: "イベント詳細",
          description: "イベントの詳細情報",
        },
      };
    }

    const eventDetail = eventDetailResult.data;
    const ogImageUrl = "/og/event-default.png";

    return {
      title: eventDetail.title,
      description: `${eventDetail.title}の詳細情報`,
      openGraph: {
        title: eventDetail.title,
        description: `${eventDetail.title}の詳細情報`,
        type: "website",
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: eventDetail.title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: eventDetail.title,
        description: `${eventDetail.title}の詳細情報`,
        images: [ogImageUrl],
      },
    };
  } catch {
    return {
      title: "イベント詳細",
      description: "イベントの詳細情報",
      openGraph: {
        title: "イベント詳細",
        description: "イベントの詳細情報",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: "イベント詳細",
        description: "イベントの詳細情報",
      },
    };
  }
}
