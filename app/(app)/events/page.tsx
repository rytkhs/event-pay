import React from "react";

import Link from "next/link";

import { Plus } from "lucide-react";

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
import { Button } from "@/components/ui/button";

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
      {/* ヘッダー - コンパクト化 */}
      <div data-testid="events-page-header" className="mb-4 border-b border-border/40 pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              イベント一覧
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentCommunity.name} に属するイベントを表示しています
            </p>
          </div>
          <Button
            asChild
            size="sm"
            className="shadow-md transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 font-semibold whitespace-nowrap"
            data-testid="create-event-button"
          >
            <Link href="/events/create" prefetch={false} className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">新しいイベントを作成</span>
              <span className="sm:hidden">作成</span>
            </Link>
          </Button>
        </div>
      </div>

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
