import { notFound, redirect } from "next/navigation";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { getCurrentUser } from "@core/auth/auth-utils";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { createCachedActions } from "@core/utils/cache-helpers";
import { handleServerError } from "@core/utils/error-handler.server";
import type {
  GetParticipantsResponse,
  GetEventPaymentsResponse,
} from "@core/validation/participant-management";

import {
  getEventDetailAction,
  getEventParticipantsAction,
  getEventPaymentsAction,
  getEventStatsAction,
} from "./actions";
import { EventManagementPage } from "./components/EventManagementPage";
import { bulkUpdateCashStatusAction, updateCashStatusAction } from "./participants/actions";

interface EventDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

// キャッシュ処理を統一（軽量化）
const cachedActions = createCachedActions({
  getEventDetail: getEventDetailAction,
  getEventPayments: getEventPaymentsAction,
  getEventStats: getEventStatsAction,
  getEventParticipants: getEventParticipantsAction,
});

export default async function EventDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  try {
    if (!params?.id) {
      notFound();
    }

    // 基本データ（詳細）取得
    const eventDetailResult = await cachedActions.getEventDetail(params.id);

    if (!eventDetailResult.success) {
      if (eventDetailResult.error.code === "EVENT_NOT_FOUND") {
        notFound();
      }
      if (eventDetailResult.error.code === "EVENT_ACCESS_DENIED") {
        redirect(`/events/${params.id}/forbidden`);
      }
      if (eventDetailResult.error.code === "EVENT_INVALID_ID") {
        notFound();
      }
      throw new Error(eventDetailResult.error.userMessage);
    }

    const eventDetail = eventDetailResult.data;
    if (!eventDetail) {
      throw new Error("イベント詳細の取得に失敗しました");
    }

    // 現在のユーザーを取得して主催者かどうか判定
    const currentUser = await getCurrentUser();
    const isOrganizer = currentUser && currentUser.id === eventDetail.created_by;

    if (!isOrganizer) {
      // 主催者でない場合は権限エラーページへ（プレビューは /guest/... で行うため）
      redirect(`/events/${params.id}/forbidden`);
    }

    // 検索パラメータの処理（タブのみ）
    const _tab = typeof searchParams.tab === "string" ? searchParams.tab : "overview";

    // 必要なデータを並列取得
    // OverviewタブでもPaymentsとStatsは必要
    // 参加者データは常に全件取得（クライアントサイドでフィルタ・ソート・ページネーション）

    const promises: [
      Promise<ActionResult<GetEventPaymentsResponse>>,
      Promise<ActionResult<{ attending_count: number; maybe_count: number }>>,
      Promise<ActionResult<GetParticipantsResponse>>,
    ] = [
      cachedActions.getEventPayments(params.id),
      cachedActions.getEventStats(params.id),
      // 常に全件取得（タブに関係なく）
      cachedActions.getEventParticipants({ eventId: params.id }),
    ];

    const [paymentsRes, statsRes, participantsRes]: [
      ActionResult<GetEventPaymentsResponse>,
      ActionResult<{ attending_count: number; maybe_count: number }>,
      ActionResult<GetParticipantsResponse>,
    ] = await Promise.all(promises);

    let stats: { attending_count: number; maybe_count: number } | null = null;
    if (statsRes.success) {
      stats = statsRes.data ?? null;
    }

    let paymentsData: GetEventPaymentsResponse | null = null;
    if (paymentsRes.success) {
      paymentsData = paymentsRes.data ?? null;
    }

    let participantsData: GetParticipantsResponse | null = null;
    if (participantsRes.success) {
      participantsData = participantsRes.data ?? null;
    }

    return (
      <EventManagementPage
        eventId={params.id}
        eventDetail={eventDetail}
        paymentsData={paymentsData}
        overviewStats={stats}
        participantsData={participantsData}
        searchParams={searchParams}
        updateCashStatusAction={updateCashStatusAction}
        bulkUpdateCashStatusAction={bulkUpdateCashStatusAction}
      />
    );
  } catch (error) {
    handleServerError(error, {
      category: "event_management",
      action: "event_page_view",
      actorType: "user",
      eventId: params?.id,
    });
    throw error;
  }
}

// ページメタデータ生成（動的タイトル設定）
export async function generateMetadata(props: EventDetailPageProps): Promise<Metadata> {
  const params = await props.params;
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
    if (!eventDetail) {
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
