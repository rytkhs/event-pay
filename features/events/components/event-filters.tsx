"use client";

import { useState, useEffect, useRef } from "react";

import { ChevronDown, ChevronUp, Search, Filter } from "lucide-react";
import { z } from "zod";

import {
  STATUS_FILTER_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
  STATUS_FILTER_LABELS,
  PAYMENT_FILTER_LABELS,
} from "@core/constants/event-filters";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [isOpen, setIsOpen] = useState(false); // デフォルトで閉じた状態
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
    <div data-testid="event-filters" className="w-full space-y-3">
      {/* メイン検索バー - 主役 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="イベント名・場所で検索..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange?.(e.target.value)}
          className="pl-10 h-11 text-base"
          data-testid="search-input"
        />
      </div>

      {/* アクティブフィルター表示のみ - クイックフィルターは削除 */}
      {(isFiltered ||
        statusFilter !== "all" ||
        paymentFilter !== "all" ||
        dateFilter.start ||
        dateFilter.end) && (
        <div className="flex flex-wrap items-center gap-2">
          {/* アクティブフィルター表示 */}
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="text-xs">
              {STATUS_FILTER_LABELS[statusFilter]}
            </Badge>
          )}
          {paymentFilter !== "all" && (
            <Badge variant="secondary" className="text-xs">
              {PAYMENT_FILTER_LABELS[paymentFilter]}
            </Badge>
          )}
          {(dateFilter.start || dateFilter.end) && (
            <Badge variant="secondary" className="text-xs">
              {dateFilter.start || "---"} 〜 {dateFilter.end || "---"}
            </Badge>
          )}
          {(isFiltered ||
            statusFilter !== "all" ||
            paymentFilter !== "all" ||
            dateFilter.start ||
            dateFilter.end) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="h-6 px-2 text-xs"
              aria-label="フィルターをクリア"
            >
              すべてクリア
            </Button>
          )}
        </div>
      )}

      {/* 詳細フィルター（収折式） - よりコンパクトに */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            data-testid="toggle-filters"
          >
            <Filter className="mr-2 h-4 w-4" />
            詳細フィルター
            {isOpen ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : (
              <ChevronDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-muted/30 rounded-lg">
            {/* ステータス */}
            <div className="space-y-2">
              <label htmlFor="status-filter" className="text-sm font-medium">
                ステータス
              </label>
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger id="status-filter" data-testid="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {STATUS_FILTER_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 料金 */}
            <div className="space-y-2">
              <label htmlFor="payment-filter" className="text-sm font-medium">
                料金
              </label>
              <Select value={paymentFilter} onValueChange={handlePaymentChange}>
                <SelectTrigger id="payment-filter" data-testid="payment-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PAYMENT_FILTER_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 日付範囲 */}
            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <fieldset>
                <legend className="text-sm font-medium">期間</legend>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    ref={startDateRef}
                    type="date"
                    value={dateFilter.start || ""}
                    onChange={(e) => handleDateChange("start", e.target.value)}
                    aria-label="開始日"
                  />
                  <span className="text-muted-foreground text-sm">〜</span>
                  <Input
                    ref={endDateRef}
                    type="date"
                    value={dateFilter.end || ""}
                    onChange={(e) => handleDateChange("end", e.target.value)}
                    aria-label="終了日"
                  />
                </div>
              </fieldset>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* エラー表示 */}
      {dateError && <p className="text-destructive text-sm">{dateError}</p>}
    </div>
  );
}
