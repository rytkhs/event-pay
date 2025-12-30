"use client";

import { useState, useMemo, useCallback } from "react";

import {
  DEFAULT_STATUS_FILTER,
  DEFAULT_PAYMENT_FILTER,
  isValidStatusFilter,
  isValidPaymentFilter,
} from "@core/constants/event-filters";
import { logger } from "@core/logging/app-logger";
import { convertJstDateToUtcRange } from "@core/utils/timezone";

import { StatusFilter, PaymentFilter, DateFilter } from "../actions/get-events";
import { Event } from "../types";

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

      // 日付範囲フィルター（date-fns-tz統一）
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
  }, [events, filters, enableClientSideFiltering]);

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
        // 無効なステータスフィルターの場合はデフォルトを適用
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
        // 無効な決済フィルターの場合はデフォルトを適用
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
        // 日付文字列を直接比較（YYYY-MM-DD形式、date-fns-tz統一）
        if (dateRange.end < dateRange.start) {
          if (process.env.NODE_ENV === "development") {
            logger.warn("Invalid date range provided, clearing date range", {
              category: "event_management",
              action: "filter_validation_failed",
              actor_type: "user",
              start_date: dateRange.start,
              end_date: dateRange.end,
              outcome: "failure",
            });
          }
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
