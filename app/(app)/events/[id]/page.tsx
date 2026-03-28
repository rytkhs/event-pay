import { notFound, redirect } from "next/navigation";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import {
  requireNonEmptyCommunityWorkspaceForServerComponent,
  resolveAppWorkspaceForServerComponent,
} from "@core/community/app-workspace";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { createCachedActions } from "@core/utils/cache-helpers";
import { handleServerError } from "@core/utils/error-handler.server";
import type {
  CollectionProgressSummary,
  GetParticipantsResponse,
} from "@core/validation/participant-management";

import { buildCollectionProgressSummary } from "@features/events/server";

import { getEventDetailAction, getEventParticipantsAction, getEventStatsAction } from "./actions";
import { EventManagementPage } from "./components/EventManagementPage";
import { bulkUpdateCashStatusAction, updateCashStatusAction } from "./participants/actions";
import { parseEventManagementQuery, type RawSearchParams } from "./query-params";

interface EventDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

// キャッシュ処理を統一（軽量化）
const cachedActions = createCachedActions({
  getEventDetail: getEventDetailAction,
  getEventStats: getEventStatsAction,
  getEventParticipants: getEventParticipantsAction,
});

export default async function EventDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  try {
    if (!params?.id) {
      notFound();
    }

    const workspace = await requireNonEmptyCommunityWorkspaceForServerComponent();
    const currentCommunity = workspace.currentCommunity;
    if (!currentCommunity) {
      notFound();
    }

    const eventDetailResult = await cachedActions.getEventDetail(params.id, currentCommunity.id);

    if (!eventDetailResult.success) {
      if (eventDetailResult.error.code === "UNAUTHORIZED") {
        redirect("/login");
      }
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

    const query = parseEventManagementQuery(searchParams);

    // 必要なデータを並列取得
    // 参加者データは常に全件取得（クライアントサイドでフィルタ・ソート・ページネーション）

    const promises: [
      Promise<ActionResult<{ attending_count: number; maybe_count: number }>>,
      Promise<ActionResult<GetParticipantsResponse>>,
    ] = [
      cachedActions.getEventStats(params.id, currentCommunity.id),
      // 常に全件取得（タブに関係なく）
      cachedActions.getEventParticipants({
        eventId: params.id,
        currentCommunityId: currentCommunity.id,
      }),
    ];

    const [statsRes, participantsRes]: [
      ActionResult<{ attending_count: number; maybe_count: number }>,
      ActionResult<GetParticipantsResponse>,
    ] = await Promise.all(promises);

    let stats: { attending_count: number; maybe_count: number } | null = null;
    if (statsRes.success) {
      stats = statsRes.data ?? null;
    }

    let participantsData: GetParticipantsResponse | null = null;
    if (participantsRes.success) {
      participantsData = participantsRes.data ?? null;
    }

    const collectionSummary: CollectionProgressSummary | null = participantsData
      ? buildCollectionProgressSummary(participantsData.participants, eventDetail.fee)
      : null;

    return (
      <EventManagementPage
        eventId={params.id}
        eventDetail={eventDetail}
        query={query}
        collectionSummary={collectionSummary}
        overviewStats={stats}
        participantsData={participantsData}
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
    const workspace = await resolveAppWorkspaceForServerComponent();
    const currentCommunityId = workspace.currentCommunity?.id ?? null;

    if (!currentCommunityId) {
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

    const eventDetailResult = await cachedActions.getEventDetail(params.id, currentCommunityId);
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
