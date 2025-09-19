"use client";

import { useState, useEffect, useRef } from "react";

import { z } from "zod";

import {
  STATUS_FILTER_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
  STATUS_FILTER_LABELS,
  PAYMENT_FILTER_LABELS,
} from "@core/constants/event-filters";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { StatusFilter, PaymentFilter, DateFilter } from "../actions/get-events";

interface EventFiltersProps {
  statusFilter: StatusFilter;
  dateFilter: DateFilter;
  paymentFilter: PaymentFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  onDateFilterChange: (dateFilter: DateFilter) => void;
  onPaymentFilterChange: (payment: PaymentFilter) => void;
  onClearFilters: () => void;
  isFiltered?: boolean;
  // 検索機能のプロップを追加
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

export function EventFilters({
  statusFilter,
  dateFilter,
  paymentFilter,
  onStatusFilterChange,
  onDateFilterChange,
  onPaymentFilterChange,
  onClearFilters,
  isFiltered = false,
  searchQuery = "",
  onSearchQueryChange,
}: EventFiltersProps) {
  const [dateError, setDateError] = useState<string>("");
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // Zodスキーマによる日付バリデーション
  const dateSchema = z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .refine(
      (data) => {
        if (data.start && data.end) {
          try {
            // 日付文字列を直接比較（YYYY-MM-DD形式）
            return data.end > data.start;
          } catch {
            return false;
          }
        }
        return true;
      },
      {
        message: "終了日は開始日より後の日付を選択してください",
      }
    );

  // 初期レンダリング時のバリデーション
  useEffect(() => {
    // 日付フィルターの初期バリデーション
    const validation = dateSchema.safeParse(dateFilter);
    if (!validation.success) {
      setDateError(validation.error.issues[0]?.message || "日付の形式が正しくありません");
    } else {
      setDateError("");
    }
  }, [dateFilter, dateSchema]);

  const handleDateChange = (field: "start" | "end", value: string) => {
    const newDateFilter = { ...dateFilter, [field]: value };

    // Zodによるバリデーション
    const validation = dateSchema.safeParse(newDateFilter);
    if (!validation.success) {
      setDateError(validation.error.issues[0]?.message || "日付の形式が正しくありません");

      // バリデーションエラー時は入力値を元の値にロールバック
      if (field === "start" && startDateRef.current) {
        startDateRef.current.value = dateFilter.start || "";
      }
      if (field === "end" && endDateRef.current) {
        endDateRef.current.value = dateFilter.end || "";
      }
      return;
    }

    setDateError("");
    onDateFilterChange(newDateFilter);
  };

  const handleStatusChange = (value: string) => {
    // Selectコンポーネントでは事前定義された値のみ選択可能なため、直接変換
    onStatusFilterChange(value as StatusFilter);
  };

  const handlePaymentChange = (value: string) => {
    // Selectコンポーネントでは事前定義された値のみ選択可能なため、直接変換
    onPaymentFilterChange(value as PaymentFilter);
  };

  const handleClearFilters = () => {
    setDateError("");
    onClearFilters();
  };

  return (
    <div data-testid="event-filters" className="w-full">
      {/* 統合フィルターバー */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* 検索 */}
        <div className="flex-1 min-w-0">
          <Input
            type="text"
            placeholder="イベント名・場所で検索..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange?.(e.target.value)}
            className="w-full"
            data-testid="search-input"
          />
        </div>

        {/* フィルター要素 */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* ステータス */}
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger
              className="w-auto min-w-[120px]"
              data-testid="status-filter"
              aria-label="ステータス"
            >
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {STATUS_FILTER_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 料金 */}
          <Select value={paymentFilter} onValueChange={handlePaymentChange}>
            <SelectTrigger
              className="w-auto min-w-[100px]"
              data-testid="payment-filter"
              aria-label="料金"
            >
              <SelectValue placeholder="料金" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {PAYMENT_FILTER_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 日付範囲 */}
          <div className="flex items-center gap-1">
            <Input
              ref={startDateRef}
              type="date"
              value={dateFilter.start || ""}
              onChange={(e) => handleDateChange("start", e.target.value)}
              className="w-auto min-w-[140px]"
              aria-label="開始日"
            />
            <span className="text-muted-foreground text-sm">〜</span>
            <Input
              ref={endDateRef}
              type="date"
              value={dateFilter.end || ""}
              onChange={(e) => handleDateChange("end", e.target.value)}
              className="w-auto min-w-[140px]"
              aria-label="終了日"
            />
          </div>

          {/* クリアボタン */}
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="px-2 py-1 h-8 text-xs"
              aria-label="フィルターをクリア"
            >
              クリア
            </Button>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {dateError && <p className="text-destructive text-sm mt-2">{dateError}</p>}
    </div>
  );
}
