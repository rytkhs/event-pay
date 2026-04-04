"use client";

import { useState, useEffect } from "react";

import { Search, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";

import {
  STATUS_FILTER_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
  STATUS_FILTER_LABELS,
  PAYMENT_FILTER_LABELS,
  SORT_BY_OPTIONS,
  SORT_BY_LABELS,
} from "@core/constants/event-filters";
import type {
  StatusFilter,
  PaymentFilter,
  DateFilter,
  SortBy,
  SortOrder,
} from "@core/types/event-query";

import { cn } from "@/components/ui/_lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { eventFilterDateSchema } from "../validation";

interface EventFiltersProps {
  statusFilter: StatusFilter;
  dateFilter: DateFilter;
  paymentFilter: PaymentFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  onDateFilterChange: (dateFilter: DateFilter) => void;
  onPaymentFilterChange: (payment: PaymentFilter) => void;
  onClearFilters: () => void;
  isFiltered?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortChange: (sortBy: SortBy) => void;
  onOrderChange: (order: SortOrder) => void;
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
  sortBy,
  sortOrder,
  onSortChange,
  onOrderChange,
}: EventFiltersProps) {
  const [dateError, setDateError] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const validation = eventFilterDateSchema.safeParse(dateFilter);
    if (!validation.success) {
      setDateError(validation.error.issues[0]?.message || "日付形式を確認してください");
    } else {
      setDateError("");
    }
  }, [dateFilter]);

  const handleDateChange = (field: "start" | "end", value: string) => {
    const newDateFilter = { ...dateFilter, [field]: value };
    const validation = eventFilterDateSchema.safeParse(newDateFilter);
    if (!validation.success) {
      setDateError(validation.error.issues[0]?.message || "日付形式を確認してください");
      return;
    }
    setDateError("");
    onDateFilterChange(newDateFilter);
  };

  const handleClearFilters = () => {
    setDateError("");
    onClearFilters();
  };

  return (
    <div data-testid="event-filters-v2" className="w-full space-y-3">
      {/* Linear-style integrated toolbar */}
      <div className="flex items-center gap-2 p-1 bg-muted/40 border border-border/60 rounded-xl shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)]">
        {/* Search Input Area */}
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-focus-within:text-foreground/80" />
          <Input
            type="text"
            placeholder="イベント・場所で検索..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange?.(e.target.value)}
            className={cn(
              "pl-9 h-9 border-none bg-transparent shadow-none focus-visible:ring-0 text-sm placeholder:text-muted-foreground/45",
              "transition-all duration-200"
            )}
            data-testid="search-input"
          />
        </div>

        <div className="flex items-center gap-1.5 px-1">
          {/* Sort Trigger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-muted-foreground hover:text-foreground hover:bg-background/80"
              >
                <ArrowUpDown className="h-3.5 w-3.5 mr-2 opacity-60" />
                <span className="text-[11px] font-medium tracking-wide">
                  {SORT_BY_LABELS[sortBy]}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-lg border-border/60 shadow-lg">
              <DropdownMenuLabel className="text-[10px] font-semibold text-muted-foreground/60 tracking-[0.18em] uppercase px-3 py-2">
                並び替え
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sortBy}
                onValueChange={(v) => onSortChange(v as SortBy)}
              >
                {SORT_BY_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem key={opt} value={opt} className="text-sm py-2">
                    {SORT_BY_LABELS[opt]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator className="bg-border/40" />
              <DropdownMenuRadioGroup
                value={sortOrder}
                onValueChange={(v) => onOrderChange(v as SortOrder)}
              >
                <DropdownMenuRadioItem value="desc" className="text-sm py-2">
                  降順
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="asc" className="text-sm py-2">
                  昇順
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-[1px] h-4 bg-border/40" />

          {/* Filter Trigger */}
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant={isOpen ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 px-2.5 transition-all duration-200",
                  isOpen
                    ? "bg-background text-foreground shadow-sm border border-border/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/80"
                )}
                data-testid="toggle-filters"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-2 opacity-60" />
                <span className="text-[11px] font-medium tracking-wide">フィルター</span>
                {isFiltered && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary" />}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      </div>

      {/* Filter Content (Collapsible) */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent className="overflow-hidden transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200">
          <div className="p-4 bg-muted/20 border border-border/40 rounded-xl shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Status */}
            <div className="space-y-1.5">
              <label
                htmlFor="status-filter"
                className="text-[10px] font-semibold text-muted-foreground/60 tracking-[0.18em] uppercase ml-0.5"
              >
                ステータス
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}
              >
                <SelectTrigger
                  id="status-filter"
                  className="h-9 bg-background border-border/40 rounded-lg shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-lg border-border/60">
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {STATUS_FILTER_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment */}
            <div className="space-y-1.5">
              <label
                htmlFor="payment-filter"
                className="text-[10px] font-semibold text-muted-foreground/60 tracking-[0.18em] uppercase ml-0.5"
              >
                参加費
              </label>
              <Select
                value={paymentFilter}
                onValueChange={(v) => onPaymentFilterChange(v as PaymentFilter)}
              >
                <SelectTrigger
                  id="payment-filter"
                  className="h-9 bg-background border-border/40 rounded-lg shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-lg border-border/60">
                  {PAYMENT_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PAYMENT_FILTER_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground/60 tracking-[0.18em] uppercase ml-0.5">
                開催期間
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFilter.start || ""}
                  onChange={(e) => handleDateChange("start", e.target.value)}
                  className="h-9 bg-background border-border/40 rounded-lg text-xs"
                />
                <span className="text-muted-foreground/40 text-xs">〜</span>
                <Input
                  type="date"
                  value={dateFilter.end || ""}
                  onChange={(e) => handleDateChange("end", e.target.value)}
                  className="h-9 bg-background border-border/40 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Active Badges */}
      {isFiltered && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5 pt-1">
          {statusFilter !== "all" && (
            <Badge
              variant="outline"
              className="h-6 rounded-full border-border/60 bg-background/50 text-[10px] font-medium py-0 px-2.5"
            >
              <span className="text-muted-foreground mr-1">状態:</span>{" "}
              {STATUS_FILTER_LABELS[statusFilter]}
            </Badge>
          )}
          {paymentFilter !== "all" && (
            <Badge
              variant="outline"
              className="h-6 rounded-full border-border/60 bg-background/50 text-[10px] font-medium py-0 px-2.5"
            >
              <span className="text-muted-foreground mr-1">費:</span>{" "}
              {PAYMENT_FILTER_LABELS[paymentFilter]}
            </Badge>
          )}
          {(dateFilter.start || dateFilter.end) && (
            <Badge
              variant="outline"
              className="h-6 rounded-full border-border/60 bg-background/50 text-[10px] font-medium py-0 px-2.5"
            >
              <span className="text-muted-foreground mr-1">間:</span> {dateFilter.start || "... "}〜
              {dateFilter.end || " ..."}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-6 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
          >
            クリア <X className="ml-1 h-2.5 w-2.5" />
          </Button>
        </div>
      )}

      {dateError && <p className="text-[11px] text-destructive px-1">{dateError}</p>}
    </div>
  );
}
