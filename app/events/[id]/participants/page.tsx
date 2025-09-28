import { notFound, redirect } from "next/navigation";

import { Metadata } from "next";

import { getCurrentUser } from "@core/auth/auth-utils";
import { createCachedActions } from "@core/utils/cache-helpers";

import {
  getEventDetailAction,
  getEventParticipantsAction,
  getEventPaymentsAction,
} from "@features/events";

import { ParticipantsManagementLayout } from "./components/participants-management-layout";

interface ParticipantsPageProps {
  params: {
    id: string;
  };
  searchParams: { [key: string]: string | string[] | undefined };
}

// キャッシュ処理を統一（参加者管理専用）
const cachedActions = createCachedActions({
  getEventDetail: getEventDetailAction,
  getEventPayments: getEventPaymentsAction,
  getEventParticipants: getEventParticipantsAction,
});

export async function generateMetadata({ params }: ParticipantsPageProps): Promise<Metadata> {
  if (!params?.id) {
    return {
      title: "イベントが見つかりません - みんなの集金",
    };
  }

  const eventDetailResult = await cachedActions.getEventDetail(params.id);

  if (!eventDetailResult.success) {
    return {
      title: "イベントが見つかりません - みんなの集金",
    };
  }

  const eventTitle = eventDetailResult.data.title;

  return {
    title: `参加者管理 - ${eventTitle} | みんなの集金`,
    description: `${eventTitle}の参加者管理・集金状況の確認と管理を行えます。`,
  };
}

export default async function ParticipantsManagementPage({
  params,
  searchParams,
}: ParticipantsPageProps) {
  try {
    if (!params?.id) {
      notFound();
    }

    // まずイベント詳細を取得して権限確認
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

    if (!isOrganizer) {
      redirect(`/events/${params.id}/forbidden`);
    }

    // 検索パラメータの処理
    const page = searchParams.page ? parseInt(String(searchParams.page), 10) : 1;
    const limit = searchParams.limit ? parseInt(String(searchParams.limit), 10) : 50;
    const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
    const attendanceStatus =
      typeof searchParams.attendance === "string" ? searchParams.attendance : undefined;
    const paymentMethod =
      typeof searchParams.payment_method === "string" ? searchParams.payment_method : undefined;
    const paymentStatus =
      typeof searchParams.payment_status === "string" ? searchParams.payment_status : undefined;
    // smart指定時はサーバー側のsortFieldは安全な既存項目にフォールバック
    const isSmart = typeof searchParams.smart === "string";
    const sortField = isSmart
      ? ("updated_at" as const)
      : typeof searchParams.sort === "string"
        ? searchParams.sort
        : "created_at";
    const sortOrder = searchParams.order === "asc" ? "asc" : "desc";

    // 参加者管理に必要なデータを並列取得
    const [participantsResult, paymentsResult] = await Promise.all([
      cachedActions.getEventParticipants({
        eventId: params.id,
        page,
        limit,
        search,
        attendanceStatus: attendanceStatus as any,
        paymentMethod: paymentMethod as any,
        paymentStatus: paymentStatus as any,
        sortField: sortField as any,
        sortOrder,
      }),
      cachedActions.getEventPayments(params.id),
    ]);

    // これらのアクションは直接データを返すため、successプロパティは存在しない
    if (!participantsResult?.participants) {
      throw new Error("参加者データの取得に失敗しました");
    }

    if (!paymentsResult?.summary) {
      throw new Error("決済データの取得に失敗しました");
    }

    return (
      <ParticipantsManagementLayout
        eventId={params.id}
        eventDetail={eventDetail}
        participantsData={participantsResult}
        paymentsData={paymentsResult}
        searchParams={searchParams}
      />
    );
  } catch (error) {
    console.error("Participants management page error:", error);
    throw error;
  }
}
