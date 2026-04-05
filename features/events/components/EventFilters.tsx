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
    <div data-testid="event-filters-v2" className="w-full space-y-2">
      {/* Premium Integrated Toolbar */}
      <div className="flex items-center gap-2 p-1 bg-card/60 backdrop-blur-md border border-border/60 rounded-2xl shadow-[0_4px_20px_-10px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.5)] dark:shadow-[0_4px_20px_-10px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]">
        {/* Search Input Area */}
        <div className="relative flex-1 group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground/50 transition-colors group-focus-within:text-primary/70" />
          </div>
          <Input
            type="text"
            placeholder="イベント・場所で検索..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange?.(e.target.value)}
            className={cn(
              "pl-10 h-9 border-none bg-transparent shadow-none focus-visible:ring-0 text-[13px] font-medium placeholder:text-muted-foreground/40",
              "transition-all duration-200"
            )}
            data-testid="search-input"
          />
        </div>

        <div className="flex items-center gap-1 pr-1">
          {/* Sort Trigger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 rounded-xl text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 transition-all duration-200"
              >
                <ArrowUpDown className="h-3.5 w-3.5 sm:mr-2 opacity-50 flex-shrink-0" />
                <span className="hidden sm:inline text-[12px] font-semibold tracking-tight truncate">
                  {SORT_BY_LABELS[sortBy]}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52 rounded-2xl border-border/60 p-1.5 shadow-lg backdrop-blur-xl"
            >
              <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground/50 tracking-[0.2em] uppercase px-3 py-2.5">
                Sort By
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sortBy}
                onValueChange={(v) => onSortChange(v as SortBy)}
              >
                {SORT_BY_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem
                    key={opt}
                    value={opt}
                    className="rounded-xl pl-8 pr-2 py-2 text-sm font-medium focus:bg-primary/5 focus:text-primary transition-colors"
                  >
                    {SORT_BY_LABELS[opt]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator className="mx-1 my-1.5 bg-border/40" />
              <DropdownMenuRadioGroup
                value={sortOrder}
                onValueChange={(v) => onOrderChange(v as SortOrder)}
              >
                <DropdownMenuRadioItem
                  value="desc"
                  className="rounded-xl pl-8 pr-2 py-2 text-sm font-medium focus:bg-primary/5 focus:text-primary transition-colors"
                >
                  新しい順 / 高い順
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="asc"
                  className="rounded-xl pl-8 pr-2 py-2 text-sm font-medium focus:bg-primary/5 focus:text-primary transition-colors"
                >
                  古い順 / 低い順
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-[1px] h-4 bg-border/40 mx-1" />

          {/* Filter Trigger */}
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant={isOpen ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-9 px-3 rounded-xl transition-all duration-200 relative",
                  isOpen
                    ? "bg-primary/10 text-primary hover:bg-primary/15 shadow-sm"
                    : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50"
                )}
                data-testid="toggle-filters"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 sm:mr-2 opacity-50 flex-shrink-0" />
                <span className="hidden sm:inline text-[12px] font-bold tracking-tight">
                  Filters
                </span>
                {isFiltered && (
                  <span className="absolute -top-0.5 -right-0.5 sm:top-0 sm:right-0 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary border-2 border-background"></span>
                  </span>
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      </div>

      {/* Filter Content (Collapsible) */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent className="overflow-hidden transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300">
          <div className="p-4 bg-card/40 backdrop-blur-sm border border-border/60 rounded-2xl shadow-md grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-1">
            {/* Status */}
            <div className="space-y-2">
              <label
                htmlFor="status-filter"
                className="text-[10px] font-bold text-muted-foreground/50 tracking-[0.2em] uppercase ml-1"
              >
                Status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}
              >
                <SelectTrigger
                  id="status-filter"
                  className="h-9 bg-background/50 border-border/40 rounded-xl shadow-sm focus:ring-primary/20"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/60 backdrop-blur-xl">
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} className="rounded-lg">
                      {STATUS_FILTER_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment */}
            <div className="space-y-2">
              <label
                htmlFor="payment-filter"
                className="text-[10px] font-bold text-muted-foreground/50 tracking-[0.2em] uppercase ml-1"
              >
                Payment
              </label>
              <Select
                value={paymentFilter}
                onValueChange={(v) => onPaymentFilterChange(v as PaymentFilter)}
              >
                <SelectTrigger
                  id="payment-filter"
                  className="h-9 bg-background/50 border-border/40 rounded-xl shadow-sm focus:ring-primary/20"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/60 backdrop-blur-xl">
                  {PAYMENT_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} className="rounded-lg">
                      {PAYMENT_FILTER_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2 md:col-span-2 xl:col-span-1">
              <span className="text-[10px] font-bold text-muted-foreground/50 tracking-[0.2em] uppercase ml-1">
                Date Range
              </span>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="date"
                    value={dateFilter.start || ""}
                    onChange={(e) => handleDateChange("start", e.target.value)}
                    className="w-full h-9 bg-background/50 border-border/40 rounded-xl text-xs focus:ring-primary/20"
                  />
                </div>
                <span className="text-muted-foreground/30 text-xs">to</span>
                <div className="relative flex-1">
                  <Input
                    type="date"
                    value={dateFilter.end || ""}
                    onChange={(e) => handleDateChange("end", e.target.value)}
                    className="w-full h-9 bg-background/50 border-border/40 rounded-xl text-xs focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Active Badges */}
      {isFiltered && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
          {statusFilter !== "all" && (
            <Badge
              variant="outline"
              className="h-7 rounded-full border-primary/20 bg-primary/5 text-primary text-[10px] font-bold py-0 px-3"
            >
              <span className="opacity-60 mr-1.5 uppercase tracking-tighter">Status:</span>{" "}
              {STATUS_FILTER_LABELS[statusFilter]}
            </Badge>
          )}
          {paymentFilter !== "all" && (
            <Badge
              variant="outline"
              className="h-7 rounded-full border-primary/20 bg-primary/5 text-primary text-[10px] font-bold py-0 px-3"
            >
              <span className="opacity-60 mr-1.5 uppercase tracking-tighter">Paid:</span>{" "}
              {PAYMENT_FILTER_LABELS[paymentFilter]}
            </Badge>
          )}
          {(dateFilter.start || dateFilter.end) && (
            <Badge
              variant="outline"
              className="h-7 rounded-full border-primary/20 bg-primary/5 text-primary text-[10px] font-bold py-0 px-3"
            >
              <span className="opacity-60 mr-1.5 uppercase tracking-tighter">Period:</span>{" "}
              {dateFilter.start || "..."} — {dateFilter.end || "..."}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-7 px-3 text-[10px] font-bold text-muted-foreground/60 hover:text-destructive hover:bg-destructive/5 transition-colors rounded-full"
          >
            CLEAR ALL <X className="ml-1.5 h-3 w-3" />
          </Button>
        </div>
      )}

      {dateError && (
        <div className="flex items-center gap-2 px-2 py-1 mt-1 text-[11px] text-destructive bg-destructive/5 rounded-lg border border-destructive/10 animate-in fade-in slide-in-from-top-1">
          <span className="font-bold uppercase tracking-tighter">Error:</span> {dateError}
        </div>
      )}
    </div>
  );
}
