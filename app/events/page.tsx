import React, { Suspense } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  DEFAULT_STATUS_FILTER,
  DEFAULT_PAYMENT_FILTER,
} from "@core/constants/event-filters";
import type { SortBy, SortOrder, StatusFilter, PaymentFilter } from "@core/types/events";

import { EventListWithFilters, EventLoading } from "@features/events";

import { InlineErrorCard } from "@/components/errors";
import { Button } from "@/components/ui/button";

import { getEventsAction } from "./actions";

interface EventsContentProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

async function EventsContent({ searchParams }: EventsContentProps) {
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
    Array.isArray(searchParams.limit) ? searchParams.limit[0] : searchParams.limit || "10",
    10
  );

  const result = await getEventsAction({
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

  if (!result.success) {
    // 認証エラーの場合はログインページにリダイレクト
    if (result.error.includes("認証")) {
      redirect("/login");
    }

    // その他のエラー
    return (
      <InlineErrorCard
        code="500"
        category="business"
        severity="medium"
        title="イベントの読み込みエラー"
        message={result.error}
        description="イベント一覧の取得に失敗しました。ページを再読み込みしてください。"
        showRetry={true}
        compact={false}
      />
    );
  }

  return (
    <EventListWithFilters
      events={result.data}
      totalCount={result.totalCount ?? 0}
      initialSortBy={sortBy}
      initialSortOrder={sortOrder}
      initialStatusFilter={statusFilter}
      initialPaymentFilter={paymentFilter}
      initialDateFilter={{ start: dateStart, end: dateEnd }}
    />
  );
}

interface EventsPageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  return (
    <div data-testid="events-page-container" className="container mx-auto px-4 py-6">
      {/* モダンヘッダー - 新規作成ボタン統合 */}
      <div data-testid="events-page-header" className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">イベント一覧</h1>
            <p className="text-muted-foreground mt-1">みんなの集金でイベントを管理しましょう</p>
          </div>
          <Button
            asChild
            size="default"
            className="w-fit sm:w-auto"
            data-testid="create-event-button"
          >
            <Link href="/events/create" className="inline-flex items-center gap-2">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              新しいイベント
            </Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={<EventLoading />}>
        <EventsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
