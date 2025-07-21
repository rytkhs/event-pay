import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EventListWithFilters } from "@/components/events/event-list-with-filters";
import { EventLoading } from "@/components/events/event-loading";
import { EventError } from "@/components/events/event-error";
import { Button } from "@/components/ui/button";
import { getEventsAction } from "./actions";
import type { SortBy, SortOrder, StatusFilter, PaymentFilter } from "./actions/get-events";
import {
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  DEFAULT_STATUS_FILTER,
  DEFAULT_PAYMENT_FILTER,
} from "@/lib/constants/event-filters";

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
    return <EventError error={new Error(result.error)} reset={() => window.location.reload()} />;
  }

  return (
    <EventListWithFilters
      events={result.data}
      totalCount={result.totalCount}
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
    <div data-testid="events-page-container" className="container mx-auto px-4 py-8">
      <div data-testid="events-page-header" className="mb-8">
        <h1 className="text-3xl font-bold">イベント一覧</h1>
        <Button asChild className="mt-4">
          <Link href="/events/create">新しいイベントを作成</Link>
        </Button>
      </div>

      <Suspense fallback={<EventLoading />}>
        <EventsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
