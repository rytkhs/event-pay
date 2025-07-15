import { useState, useMemo, useCallback } from "react";
import { Event } from "@/types/event";
import { StatusFilter, PaymentFilter, DateFilter } from "@/app/events/actions/get-events";
import { convertJstDateToUtcRange } from "@/lib/utils/timezone";
import {
  STATUS_FILTER_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
  DEFAULT_STATUS_FILTER,
  DEFAULT_PAYMENT_FILTER,
  isValidStatusFilter,
  isValidPaymentFilter,
} from "@/lib/constants/event-filters";

export interface Filters {
  status: StatusFilter;
  payment: PaymentFilter;
  dateRange: DateFilter;
}

interface UseEventFilterOptions {
  events?: Event[];
  onFiltersChange?: (filters: Filters) => void;
  enableClientSideFiltering?: boolean;
  initialFilters?: Partial<Filters>;
}

export function useEventFilter(options: UseEventFilterOptions = {}) {
  const {
    events = [],
    onFiltersChange,
    enableClientSideFiltering = false,
    initialFilters,
  } = options;

  const [filters, setFilters] = useState<Filters>({
    status: initialFilters?.status || DEFAULT_STATUS_FILTER,
    payment: initialFilters?.payment || DEFAULT_PAYMENT_FILTER,
    dateRange: initialFilters?.dateRange || {},
  });

  // サーバーサイドフィルタリングが有効な場合はクライアントサイドフィルタリングをスキップ
  const filteredEvents = useMemo(() => {
    if (!enableClientSideFiltering) {
      return events;
    }

    if (!events || !Array.isArray(events)) return [];

    return events.filter((event) => {
      // ステータスフィルター
      if (filters.status !== "all") {
        if (event.status !== filters.status) {
          return false;
        }
      }

      // 決済状況フィルター
      if (filters.payment !== "all") {
        const isFree = (event.fee ?? 0) === 0;
        if (filters.payment === "free" && !isFree) return false;
        if (filters.payment === "paid" && isFree) return false;
      }

      // 日付範囲フィルター
      if (filters.dateRange.start) {
        const eventDate = new Date(event.date);
        const { startOfDay } = convertJstDateToUtcRange(filters.dateRange.start);
        if (eventDate < startOfDay) return false;
      }

      if (filters.dateRange.end) {
        const eventDate = new Date(event.date);
        const { endOfDay } = convertJstDateToUtcRange(filters.dateRange.end);
        if (eventDate > endOfDay) return false;
      }

      return true;
    });
  }, [events, events.length, filters, enableClientSideFiltering]);

  const updateFilters = useCallback(
    (newFilters: Filters) => {
      setFilters(newFilters);
      onFiltersChange?.(newFilters);
    },
    [onFiltersChange]
  );

  const setStatusFilter = useCallback(
    (status: StatusFilter) => {
      if (!isValidStatusFilter(status)) {
        console.warn("無効なステータスフィルターです。全件表示に設定します。");
        status = DEFAULT_STATUS_FILTER;
      }
      const newFilters = { ...filters, status };
      updateFilters(newFilters);
    },
    [filters, updateFilters]
  );

  const setPaymentFilter = useCallback(
    (payment: PaymentFilter) => {
      if (!isValidPaymentFilter(payment)) {
        console.warn("無効な決済フィルターです。全件表示に設定します。");
        payment = DEFAULT_PAYMENT_FILTER;
      }
      const newFilters = { ...filters, payment };
      updateFilters(newFilters);
    },
    [filters, updateFilters]
  );

  const setDateRangeFilter = useCallback(
    (dateRange: DateFilter) => {
      if (dateRange.start && dateRange.end) {
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        if (endDate < startDate) {
          console.warn("終了日は開始日より前の日付は指定できません。日付範囲をクリアします。");
          dateRange = {};
        }
      }
      const newFilters = { ...filters, dateRange };
      updateFilters(newFilters);
    },
    [filters, updateFilters]
  );

  const clearFilters = useCallback(() => {
    const newFilters: Filters = {
      status: DEFAULT_STATUS_FILTER,
      payment: DEFAULT_PAYMENT_FILTER,
      dateRange: {},
    };
    updateFilters(newFilters);
  }, [updateFilters]);

  return {
    filteredEvents,
    filters,
    setFilters: updateFilters,
    setStatusFilter,
    setPaymentFilter,
    setDateRangeFilter,
    clearFilters,
  };
}
