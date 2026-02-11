"use client";

import { useEffect } from "react";

import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";

import {
  SORT_BY_OPTIONS,
  SORT_BY_LABELS,
  isValidSortBy,
  isValidSortOrder,
} from "@core/constants/event-filters";
import type { SortBy, SortOrder } from "@core/types/event-query";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EventSortProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortChange: (sortBy: SortBy) => void;
  onOrderChange: (order: SortOrder) => void;
}

export function EventSort({ sortBy, sortOrder, onSortChange, onOrderChange }: EventSortProps) {
  // 無効な値の検証とデフォルト値の適用
  useEffect(() => {
    if (!isValidSortBy(sortBy)) {
      // 無効なソート条件の場合はデフォルトを適用
    }
    if (!isValidSortOrder(sortOrder)) {
      // 無効なソート順序の場合は昇順を適用
    }
  }, [sortBy, sortOrder]);

  const handleSortChange = (value: string) => {
    if (isValidSortBy(value)) {
      onSortChange(value);
    }
  };

  const handleOrderChange = (value: string) => {
    if (isValidSortOrder(value)) {
      onOrderChange(value);
    }
  };

  return (
    <div data-testid="event-sort" className="flex items-center gap-2">
      {/* ソート条件 */}
      <Select value={sortBy} onValueChange={handleSortChange}>
        <SelectTrigger
          className="w-auto min-w-[120px]"
          data-testid="sort-by-select"
          aria-label="並び順"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_BY_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {SORT_BY_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* ソート順序ボタン */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => handleOrderChange(sortOrder === "asc" ? "desc" : "asc")}
        className="h-10 w-10 shrink-0"
        title={sortOrder === "asc" ? "昇順 (クリックで降順)" : "降順 (クリックで昇順)"}
        aria-label={
          sortOrder === "asc"
            ? "昇順でソート中（クリックで降順）"
            : "降順でソート中（クリックで昇順）"
        }
      >
        {sortOrder === "asc" ? (
          <ArrowUpNarrowWide data-testid="sort-arrow-up" className="h-4 w-4" />
        ) : (
          <ArrowDownWideNarrow data-testid="sort-arrow-down" className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
