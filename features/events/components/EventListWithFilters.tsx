"use client";

import { useState, useCallback, useTransition, useMemo } from "react";

import { useRouter } from "next/navigation";

import { isValidSortBy, isValidSortOrder } from "@core/constants/event-filters";
import { usePagination } from "@core/hooks/usePagination";
import type {
  SortBy,
  SortOrder,
  StatusFilter,
  PaymentFilter,
  DateFilter,
} from "@core/types/event-query";

import { useEventFilter, Filters } from "../hooks/useEventFilter";
import { EventListItem } from "../types";

import { EventFilters } from "./EventFilters";
import { EventList } from "./EventList";
import { Pagination } from "./Pagination";

interface EventListWithFiltersProps {
  events: EventListItem[];
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
  initialSortOrder = "desc",
  initialStatusFilter = "all",
  initialPaymentFilter = "all",
  initialDateFilter = {},
}: EventListWithFiltersProps) {
  const router = useRouter();
  const [isPending] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");

  const { currentPage, pageSize, setPage } = usePagination({
    defaultPage: 1,
    defaultPageSize: 24,
  });

  const [sortBy, setSortBy] = useState<SortBy>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);

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

  const handleFiltersChange = useCallback(
    async (newFilters: Filters) => {
      updateUrlParams({
        status: newFilters.status,
        payment: newFilters.payment,
        dateStart: newFilters.dateRange.start,
        dateEnd: newFilters.dateRange.end,
        sortBy,
        sortOrder,
        page: "1",
      });
    },
    [updateUrlParams, sortBy, sortOrder]
  );

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
        page: "1",
      });
    },
    [updateUrlParams]
  );

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

  const customSetSortBy = useCallback(
    (newSortBy: SortBy) => {
      if (isValidSortBy(newSortBy)) {
        handleSortChange(newSortBy, sortOrder, filters);
      }
    },
    [handleSortChange, sortOrder, filters]
  );

  const customSetSortOrder = useCallback(
    (newSortOrder: SortOrder) => {
      if (isValidSortOrder(newSortOrder)) {
        handleSortChange(sortBy, newSortOrder, filters);
      }
    },
    [handleSortChange, sortBy, filters]
  );

  const isFiltered =
    filters.status !== "all" ||
    filters.payment !== "all" ||
    !!filters.dateRange.start ||
    !!filters.dateRange.end;

  const displayEvents = useMemo(() => {
    if (!searchQuery.trim()) {
      return events;
    }

    const query = searchQuery.toLowerCase().trim();
    return events.filter((event) => {
      return (
        event.title.toLowerCase().includes(query) ||
        (event.location ?? "").toLowerCase().includes(query)
      );
    });
  }, [events, searchQuery]);

  const isDisplayLoading = isPending || initialLoading;

  return (
    <div className="space-y-6" data-testid="event-list-with-filters">
      {/* Search & Filter Toolbar */}
      <EventFilters
        statusFilter={filters.status}
        dateFilter={filters.dateRange}
        paymentFilter={filters.payment}
        onStatusFilterChange={setStatusFilter}
        onDateFilterChange={setDateRangeFilter}
        onPaymentFilterChange={setPaymentFilter}
        onClearFilters={clearFilters}
        isFiltered={isFiltered}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={customSetSortBy}
        onOrderChange={customSetSortOrder}
      />

      {/* Main Content Area */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-1">
          <div className="text-[10px] font-bold text-muted-foreground/60 tracking-[0.15em] uppercase">
            {totalCount} EVENTS FOUND
          </div>
        </div>

        {/* Event List */}
        <div className="border-t border-border/40">
          <EventList events={displayEvents} isLoading={isDisplayLoading} isFiltered={isFiltered} />
        </div>

        {/* Footer Area: Pagination & Count summary */}
        {totalCount > 0 && (
          <div className="flex flex-col items-center gap-4 pt-10 pb-20">
            {totalCount > pageSize && (
              <Pagination
                currentPage={currentPage}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            )}

            <div className="text-[10px] font-medium text-muted-foreground/45 tracking-wider uppercase">
              SHOWING {Math.min((currentPage - 1) * pageSize + 1, totalCount)} –{" "}
              {Math.min(currentPage * pageSize, totalCount)} OF {totalCount}
            </div>
          </div>
        )}

        {totalCount === 0 && !isDisplayLoading && (
          <div className="text-sm text-muted-foreground text-center py-20 border-t border-border/40">
            該当するイベントがありません
          </div>
        )}
      </div>
    </div>
  );
}
