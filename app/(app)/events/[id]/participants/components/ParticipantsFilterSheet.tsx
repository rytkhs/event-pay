"use client";

import { useState, useEffect } from "react";

import { Filter, X, SlidersHorizontal } from "lucide-react";

import { type SimplePaymentStatus } from "@core/utils/payment-status-mapper";

import { SIMPLE_PAYMENT_STATUS_LABELS } from "@features/events";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import type {
  EventManagementQuery,
  EventManagementQueryPatch,
  ParticipantSortField,
  ParticipantSortOrder,
} from "../../query-params";

interface ParticipantsFilterSheetProps {
  query: EventManagementQuery;
  onFiltersChange: (patch: EventManagementQueryPatch) => void;
  isFreeEvent: boolean;
}

const DEFAULT_SORT_FIELD: ParticipantSortField = "created_at";
const DEFAULT_SORT_ORDER: ParticipantSortOrder = "desc";

function getDraftState(query: EventManagementQuery) {
  return {
    paymentMethod: query.paymentMethod ?? "all",
    paymentStatus: query.paymentStatus ?? "all",
    sortField: query.sort ?? DEFAULT_SORT_FIELD,
    sortOrder: query.order ?? DEFAULT_SORT_ORDER,
  } as const;
}

function getActiveFiltersCount(query: EventManagementQuery, isFreeEvent: boolean): number {
  let count = 0;

  if (!isFreeEvent && query.paymentMethod) count += 1;
  if (!isFreeEvent && query.paymentStatus) count += 1;
  if (query.sort && query.order) count += 1;

  return count;
}

export function ParticipantsFilterSheet({
  query,
  onFiltersChange,
  isFreeEvent,
}: ParticipantsFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<
    EventManagementQuery["paymentMethod"] | "all"
  >(query.paymentMethod ?? "all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<SimplePaymentStatus | "all">(
    query.paymentStatus ?? "all"
  );
  const [sortField, setSortField] = useState<ParticipantSortField>(
    query.sort ?? DEFAULT_SORT_FIELD
  );
  const [sortOrder, setSortOrder] = useState<ParticipantSortOrder>(
    query.order ?? DEFAULT_SORT_ORDER
  );

  const syncDraftFromQuery = (nextQuery: EventManagementQuery) => {
    const draft = getDraftState(nextQuery);
    setPaymentMethodFilter(draft.paymentMethod);
    setPaymentStatusFilter(draft.paymentStatus);
    setSortField(draft.sortField);
    setSortOrder(draft.sortOrder);
  };

  // 検索パラメータが変更されたときに内部状態を同期
  useEffect(() => {
    syncDraftFromQuery(query);
  }, [query]);

  const activeFiltersCount = getActiveFiltersCount(query, isFreeEvent);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      syncDraftFromQuery(query);
    }
    setOpen(nextOpen);
  };

  const handleApplyFilters = () => {
    const nextPaymentMethod = paymentMethodFilter === "all" ? undefined : paymentMethodFilter;
    const nextPaymentStatus = paymentStatusFilter === "all" ? undefined : paymentStatusFilter;
    const currentSortField = query.sort ?? DEFAULT_SORT_FIELD;
    const currentSortOrder = query.order ?? DEFAULT_SORT_ORDER;
    const hasSortChanged = sortField !== currentSortField || sortOrder !== currentSortOrder;
    const hasFiltersChanged =
      nextPaymentMethod !== query.paymentMethod || nextPaymentStatus !== query.paymentStatus;

    if (!hasSortChanged && !hasFiltersChanged) {
      setOpen(false);
      return;
    }

    onFiltersChange({
      paymentMethod: nextPaymentMethod,
      paymentStatus: nextPaymentStatus,
      smart: hasSortChanged ? false : query.smart,
      sort: hasSortChanged ? sortField : query.sort,
      order: hasSortChanged ? sortOrder : query.order,
    });
    setOpen(false);
  };

  const handleClearAllFilters = () => {
    setPaymentMethodFilter("all");
    setPaymentStatusFilter("all");
    setSortField(DEFAULT_SORT_FIELD);
    setSortOrder(DEFAULT_SORT_ORDER);

    onFiltersChange({
      paymentMethod: undefined,
      paymentStatus: undefined,
      smart: false,
      sort: undefined,
      order: undefined,
    });
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="relative gap-2 h-9 rounded-xl transition-all duration-300 border-border/50 shadow-sm bg-background hover:bg-muted/50 hover:border-border/80 hover:shadow-[0_4px_12px_-8px_hsl(var(--foreground)/0.3)]"
        >
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline font-medium text-foreground/80">フィルター</span>
          {activeFiltersCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px] sm:text-xs shadow-md border border-background"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[320px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            フィルターと並び替え
          </SheetTitle>
          <SheetDescription>参加者リストを絞り込みます</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* 決済方法フィルター（有料イベントのみ） */}
          {!isFreeEvent && (
            <div className="space-y-2">
              <Label>決済方法</Label>
              <Select
                value={paymentMethodFilter}
                onValueChange={(value) =>
                  setPaymentMethodFilter(value as EventManagementQuery["paymentMethod"] | "all")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="決済方法" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全て</SelectItem>
                  <SelectItem value="stripe">オンライン</SelectItem>
                  <SelectItem value="cash">現金</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 決済状況フィルター（有料イベントのみ） */}
          {!isFreeEvent && (
            <div className="space-y-2">
              <Label>決済状況</Label>
              <Select
                value={paymentStatusFilter}
                onValueChange={(v) => setPaymentStatusFilter(v as SimplePaymentStatus | "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="決済状況" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全て</SelectItem>
                  <SelectItem value="unpaid">{SIMPLE_PAYMENT_STATUS_LABELS.unpaid}</SelectItem>
                  <SelectItem value="paid">{SIMPLE_PAYMENT_STATUS_LABELS.paid}</SelectItem>
                  <SelectItem value="refunded">{SIMPLE_PAYMENT_STATUS_LABELS.refunded}</SelectItem>
                  <SelectItem value="waived">{SIMPLE_PAYMENT_STATUS_LABELS.waived}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 並び順 */}
          <div className="space-y-2">
            <Label>並び順</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={sortField}
                onValueChange={(value) => setSortField(value as ParticipantSortField)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="項目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">登録日時</SelectItem>
                  <SelectItem value="nickname">名前・ニックネーム</SelectItem>
                  <SelectItem value="status">参加状況</SelectItem>
                  <SelectItem value="updated_at">更新日時</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sortOrder}
                onValueChange={(value) => setSortOrder(value as ParticipantSortOrder)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="順序" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">降順</SelectItem>
                  <SelectItem value="asc">昇順</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              手動の並び替えを適用するとオートソートはOFFになります。
            </p>
          </div>
        </div>

        <SheetFooter className="mt-8 flex-col gap-2 sm:flex-col">
          <Button onClick={handleApplyFilters} className="w-full">
            フィルターを適用
          </Button>
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              onClick={handleClearAllFilters}
              className="w-full text-muted-foreground"
            >
              <X className="h-4 w-4 mr-2" />
              すべてクリア
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
