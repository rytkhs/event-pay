"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Event } from "@/types/event";
import { EventList } from "./event-list";
import { EventFilters } from "./event-filters";
import { EventSort } from "./event-sort";
import { Pagination } from "./pagination";
import { useEventFilter, Filters } from "@features/events/hooks/useEventFilter";
import { usePagination } from "@core/hooks/usePagination";
import type {
  SortBy,
  SortOrder,
  StatusFilter,
  PaymentFilter,
  DateFilter,
} from "@/app/events/actions/get-events";

interface EventListWithFiltersProps {
  events: Event[];
  totalCount: number;
  isLoading?: boolean;
  initialSortBy?: SortBy;
  initialSortOrder?: SortOrder;
  initialStatusFilter?: StatusFilter;
  initialPaymentFilter?: PaymentFilter;
  initialDateFilter?: DateFilter;
}

export function EventListWithFilters({
  events,
  totalCount,
  isLoading: initialLoading = false,
  initialSortBy = "date",
  initialSortOrder = "asc",
  initialStatusFilter = "all",
  initialPaymentFilter = "all",
  initialDateFilter = {},
}: EventListWithFiltersProps) {
  const router = useRouter();
  const [isPending] = useTransition();

  // ページネーション
  const { currentPage, pageSize, setPage } = usePagination({
    defaultPage: 1,
    defaultPageSize: 10,
  });

  // Zodスキーマによるバリデーション
  const sortBySchema = z.enum(["date", "created_at", "attendances_count", "fee"]);
  const sortOrderSchema = z.enum(["asc", "desc"]);

  // サーバーサイドソート状態を管理
  const [sortBy, setSortBy] = useState<SortBy>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);

  // URLパラメータ更新関数（レースコンディション対策）
  const updateUrlParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(window.location.search);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      router.replace(`/events?${params.toString()}`);
    },
    [router]
  );

  // フィルター変更時にURLパラメータを更新（ページを1にリセット）
  const handleFiltersChange = useCallback(
    async (newFilters: Filters) => {
      updateUrlParams({
        status: newFilters.status,
        payment: newFilters.payment,
        dateStart: newFilters.dateRange.start,
        dateEnd: newFilters.dateRange.end,
        sortBy,
        sortOrder,
        page: "1", // フィルター変更時はページを1にリセット
      });
    },
    [updateUrlParams, sortBy, sortOrder]
  );

  // ソート変更時にURLパラメータを更新（ページを1にリセット）
  const handleSortChange = useCallback(
    (newSortBy: SortBy, newSortOrder: SortOrder, currentFilters: Filters) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);

      updateUrlParams({
        sortBy: newSortBy,
        sortOrder: newSortOrder,
        status: currentFilters.status,
        payment: currentFilters.payment,
        dateStart: currentFilters.dateRange.start,
        dateEnd: currentFilters.dateRange.end,
        page: "1", // ソート変更時もページを1にリセット
      });
    },
    [updateUrlParams]
  );

  // フィルター適用（サーバーサイドのため状態管理のみ）
  const { filters, setStatusFilter, setPaymentFilter, setDateRangeFilter, clearFilters } =
    useEventFilter({
      events,
      onFiltersChange: handleFiltersChange,
      enableClientSideFiltering: false,
      initialFilters: {
        status: initialStatusFilter,
        payment: initialPaymentFilter,
        dateRange: initialDateFilter,
      },
    });

  // ソート変更ハンドラー（Zodバリデーション付き）
  const customSetSortBy = useCallback(
    (newSortBy: SortBy) => {
      const validation = sortBySchema.safeParse(newSortBy);
      if (validation.success) {
        handleSortChange(validation.data, sortOrder, filters);
      } else {
      }
    },
    [handleSortChange, sortOrder, filters, sortBySchema]
  );

  const customSetSortOrder = useCallback(
    (newSortOrder: SortOrder) => {
      const validation = sortOrderSchema.safeParse(newSortOrder);
      if (validation.success) {
        handleSortChange(sortBy, validation.data, filters);
      } else {
      }
    },
    [handleSortChange, sortBy, filters, sortOrderSchema]
  );

  // フィルターが適用されているかどうかを判定
  const isFiltered =
    filters.status !== "all" ||
    filters.payment !== "all" ||
    !!filters.dateRange.start ||
    !!filters.dateRange.end;

  // 表示するイベントはサーバーから取得したもの
  const displayEvents = events;

  // ローディング状態
  const isDisplayLoading = isPending || initialLoading;

  return (
    <div className="space-y-6" data-testid="event-list-with-filters">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* フィルター */}
        <div>
          <EventFilters
            statusFilter={filters.status}
            dateFilter={filters.dateRange}
            paymentFilter={filters.payment}
            onStatusFilterChange={setStatusFilter}
            onDateFilterChange={setDateRangeFilter}
            onPaymentFilterChange={setPaymentFilter}
            onClearFilters={clearFilters}
            isFiltered={isFiltered}
          />
        </div>

        {/* メインコンテンツ */}
        <div className="lg:col-span-3 space-y-4">
          {/* ソート */}
          <EventSort
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={customSetSortBy}
            onOrderChange={customSetSortOrder}
          />

          {/* イベント一覧 */}
          <EventList events={displayEvents} isLoading={isDisplayLoading} isFiltered={isFiltered} />

          {/* ページネーション */}
          {totalCount > pageSize && (
            <div className="flex justify-center mt-6">
              <Pagination
                currentPage={currentPage}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </div>
          )}

          {/* 結果件数表示 */}
          <div className="text-sm text-gray-600 mt-4">
            {totalCount > 0 && (
              <>
                {Math.min((currentPage - 1) * pageSize + 1, totalCount)}〜
                {Math.min(currentPage * pageSize, totalCount)}件 / 全{totalCount}件を表示
              </>
            )}
            {totalCount === 0 && "該当するイベントがありません"}
          </div>
        </div>
      </div>
    </div>
  );
}
