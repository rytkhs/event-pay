"use client";

import { useEffect } from "react";

import { z } from "zod";

import {
  SORT_BY_OPTIONS,
  SORT_BY_LABELS,
  isValidSortBy,
  isValidSortOrder,
} from "@core/constants/event-filters";

import { SortBy, SortOrder } from "@/app/events/actions/get-events";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
    <Card data-testid="event-sort" role="region" aria-label="イベントソート設定">
      <CardHeader>
        <CardTitle>ソート</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center space-x-4">
        <div className="flex-1">
          <Label htmlFor="sort-by">並び順</Label>
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger data-testid="sort-by-select" aria-label="並び順">
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
        </div>

        <div className="flex-1">
          <Label>順序</Label>
          <RadioGroup
            value={sortOrder}
            onValueChange={handleOrderChange}
            className="flex space-x-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="asc" id="asc" />
              <Label htmlFor="asc" className="flex items-center">
                昇順
                {sortOrder === "asc" && (
                  <span data-testid="sort-arrow-up" className="ml-1">
                    ↑
                  </span>
                )}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="desc" id="desc" />
              <Label htmlFor="desc" className="flex items-center">
                降順
                {sortOrder === "desc" && (
                  <span data-testid="sort-arrow-down" className="ml-1">
                    ↓
                  </span>
                )}
              </Label>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
}
