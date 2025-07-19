import { useState, useMemo, useCallback } from "react";
import { Event } from "@/types/event";
import { SortBy, SortOrder } from "@/app/events/actions/get-events";
import {
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  isValidSortBy,
  isValidSortOrder,
} from "@/lib/constants/event-filters";

export interface SortOptions {
  sortBy: SortBy;
  sortOrder: SortOrder;
}

interface UseEventSortOptions {
  events?: Event[];
  onSortChange?: (sortOptions: SortOptions) => void;
  enableClientSideSort?: boolean;
  initialSort?: Partial<SortOptions>;
}

export function useEventSort(options: UseEventSortOptions = {}) {
  const { events = [], onSortChange, enableClientSideSort = false, initialSort } = options;

  const [sortOptions, setSortOptions] = useState<SortOptions>({
    sortBy: initialSort?.sortBy || DEFAULT_SORT_BY,
    sortOrder: initialSort?.sortOrder || DEFAULT_SORT_ORDER,
  });

  // サーバーサイドソートが有効な場合はクライアントサイドソートをスキップ
  const sortedEvents = useMemo(() => {
    if (!enableClientSideSort) {
      return events;
    }

    if (!events || !Array.isArray(events)) return [];

    return [...events].sort((a, b) => {
      let comparison = 0;

      switch (sortOptions.sortBy) {
        case "date":
          // 日付文字列を直接比較（ISO文字列、date-fns-tz統一）
          comparison = a.date.localeCompare(b.date);
          break;
        case "created_at":
          // 日付文字列を直接比較（ISO文字列、date-fns-tz統一）
          comparison = a.created_at.localeCompare(b.created_at);
          break;
        case "attendances_count":
          // 参加者数はクライアントサイドで計算（集計値のため）
          const aCount = a.attendances_count || 0;
          const bCount = b.attendances_count || 0;
          comparison = aCount - bCount;
          break;
        case "fee":
          comparison = (a.fee || 0) - (b.fee || 0);
          break;
        default:
          return 0;
      }

      return sortOptions.sortOrder === "desc" ? -comparison : comparison;
    });
  }, [events, events.length, sortOptions, enableClientSideSort]);

  const updateSort = useCallback(
    (newSortOptions: SortOptions) => {
      setSortOptions(newSortOptions);
      onSortChange?.(newSortOptions);
    },
    [onSortChange]
  );

  const setSortBy = useCallback(
    (sortBy: SortBy) => {
      if (!isValidSortBy(sortBy)) {
        console.warn("無効なソート条件です。開催日時ソートに設定します。");
        sortBy = DEFAULT_SORT_BY;
      }
      const newSortOptions = { ...sortOptions, sortBy };
      updateSort(newSortOptions);
    },
    [sortOptions, updateSort]
  );

  const setSortOrder = useCallback(
    (sortOrder: SortOrder) => {
      if (!isValidSortOrder(sortOrder)) {
        console.warn("無効なソート順序です。昇順に設定します。");
        sortOrder = DEFAULT_SORT_ORDER;
      }
      const newSortOptions = { ...sortOptions, sortOrder };
      updateSort(newSortOptions);
    },
    [sortOptions, updateSort]
  );

  const resetSort = useCallback(() => {
    const newSortOptions: SortOptions = {
      sortBy: DEFAULT_SORT_BY,
      sortOrder: DEFAULT_SORT_ORDER,
    };
    updateSort(newSortOptions);
  }, [updateSort]);

  return {
    sortedEvents,
    sortOptions,
    setSortOptions: updateSort,
    setSortBy,
    setSortOrder,
    resetSort,
  };
}
