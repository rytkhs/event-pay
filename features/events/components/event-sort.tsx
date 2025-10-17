"use client";

import { useEffect } from "react";

import { z } from "zod";

import {
  SORT_BY_OPTIONS,
  SORT_BY_LABELS,
  isValidSortBy,
  isValidSortOrder,
} from "@core/constants/event-filters";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { SortBy, SortOrder } from "../actions/get-events";

interface EventSortProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortChange: (sortBy: SortBy) => void;
  onOrderChange: (order: SortOrder) => void;
}

export function EventSort({ sortBy, sortOrder, onSortChange, onOrderChange }: EventSortProps) {
  // Zodスキーマによるバリデーション
  const sortBySchema = z.enum(["date", "created_at", "attendances_count", "fee"]);
  const sortOrderSchema = z.enum(["asc", "desc"]);

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
    const validation = sortBySchema.safeParse(value);
    if (validation.success) {
      onSortChange(validation.data as SortBy);
    }
  };

  const handleOrderChange = (value: string) => {
    const validation = sortOrderSchema.safeParse(value);
    if (validation.success) {
      onOrderChange(validation.data as SortOrder);
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
        variant="ghost"
        size="sm"
        onClick={() => handleOrderChange(sortOrder === "asc" ? "desc" : "asc")}
        className="px-2 py-1 h-8"
        aria-label={
          sortOrder === "asc"
            ? "昇順でソート中（クリックで降順）"
            : "降順でソート中（クリックで昇順）"
        }
      >
        {sortOrder === "asc" ? (
          <span data-testid="sort-arrow-up" className="flex items-center">
            ↑
          </span>
        ) : (
          <span data-testid="sort-arrow-down" className="flex items-center">
            ↓
          </span>
        )}
      </Button>
    </div>
  );
}
