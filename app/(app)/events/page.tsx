import React from "react";

export const dynamic = "force-dynamic";

import { requireNonEmptyCommunityWorkspaceForServerComponent } from "@core/community/app-workspace";
import {
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  DEFAULT_STATUS_FILTER,
  DEFAULT_PAYMENT_FILTER,
} from "@core/constants/event-filters";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";
import type { SortBy, SortOrder, StatusFilter, PaymentFilter } from "@core/types/event-query";

import { EventListWithFilters } from "@features/events";
import { listEventsForCommunity } from "@features/events/server";

import { InlineErrorCard } from "@/components/errors/ui/ErrorCard";

interface EventsContentProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

async function getEventsPageResult({
  currentCommunityId,
  searchParams,
}: EventsContentProps & { currentCommunityId: string }) {
  // URLパラメータから検索・ソート条件を抽出
  const sortBy =
    ((Array.isArray(searchParams.sortBy)
      ? searchParams.sortBy[0]
      : searchParams.sortBy) as SortBy) || DEFAULT_SORT_BY;

  const sortOrder =
    ((Array.isArray(searchParams.sortOrder)
      ? searchParams.sortOrder[0]
      : searchParams.sortOrder) as SortOrder) || DEFAULT_SORT_ORDER;

  const statusFilter =
    ((Array.isArray(searchParams.status)
      ? searchParams.status[0]
      : searchParams.status) as StatusFilter) || DEFAULT_STATUS_FILTER;

  const paymentFilter =
    ((Array.isArray(searchParams.payment)
      ? searchParams.payment[0]
      : searchParams.payment) as PaymentFilter) || DEFAULT_PAYMENT_FILTER;

  const dateStart = Array.isArray(searchParams.dateStart)
    ? searchParams.dateStart[0]
    : searchParams.dateStart;

  const dateEnd = Array.isArray(searchParams.dateEnd)
    ? searchParams.dateEnd[0]
    : searchParams.dateEnd;

  // ページネーション用のパラメータ
  const page = parseInt(
    Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page || "1",
    10
  );
  const limit = parseInt(
    Array.isArray(searchParams.limit) ? searchParams.limit[0] : searchParams.limit || "24",
    10
  );

  const supabase = await createServerComponentSupabaseClient();
  const result = await listEventsForCommunity(supabase, currentCommunityId, {
    limit,
    offset: (page - 1) * limit,
    sortBy,
    sortOrder,
    statusFilter,
    paymentFilter,
    dateFilter: {
      start: dateStart,
      end: dateEnd,
    },
  });

  return { result, sortBy, sortOrder, statusFilter, paymentFilter, dateStart, dateEnd };
}

interface EventsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EventsPage(props: EventsPageProps) {
  const workspace = await requireNonEmptyCommunityWorkspaceForServerComponent();
  const searchParams = await props.searchParams;
  const currentCommunity = workspace.currentCommunity;

  if (!currentCommunity) {
    return null;
  }

  const { result, sortBy, sortOrder, statusFilter, paymentFilter, dateStart, dateEnd } =
    await getEventsPageResult({
      currentCommunityId: currentCommunity.id,
      searchParams,
    });

  return (
    <div data-testid="events-page-container" className="container mx-auto max-w-7xl">
      {result.success ? (
        <EventListWithFilters
          events={result.data?.items ?? []}
          totalCount={result.data?.totalCount ?? 0}
          initialSortBy={sortBy}
          initialSortOrder={sortOrder}
          initialStatusFilter={statusFilter}
          initialPaymentFilter={paymentFilter}
          initialDateFilter={{ start: dateStart, end: dateEnd }}
        />
      ) : (
        <InlineErrorCard
          code={result.error.code}
          category={result.error.code === "UNAUTHORIZED" ? "auth" : "business"}
          severity="medium"
          title={result.error.code === "UNAUTHORIZED" ? "認証エラー" : "イベントの読み込みエラー"}
          message={result.error.userMessage}
          description={
            result.error.code === "UNAUTHORIZED"
              ? "セッション情報を確認できませんでした。時間をおいて再度お試しください。"
              : "イベント一覧の取得に失敗しました。ページを再読み込みしてください。"
          }
          showRetry={true}
          compact={false}
        />
      )}
    </div>
  );
}
