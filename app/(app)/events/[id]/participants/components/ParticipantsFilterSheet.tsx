"use client";

import { useState, useEffect } from "react";

import { Filter, X, Search, SlidersHorizontal } from "lucide-react";

import {
  type SimplePaymentStatus,
  SIMPLE_PAYMENT_STATUS_LABELS,
} from "@core/utils/payment-status-mapper";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface ParticipantsFilterSheetProps {
  searchParams: { [key: string]: string | string[] | undefined };
  onFiltersChange: (params: Record<string, string | undefined>) => void;
  isFreeEvent: boolean;
}

export function ParticipantsFilterSheet({
  searchParams,
  onFiltersChange,
  isFreeEvent,
}: ParticipantsFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(
    typeof searchParams.search === "string" ? searchParams.search : ""
  );
  const [paymentMethodFilter, setPaymentMethodFilter] = useState(
    typeof searchParams.payment_method === "string" ? searchParams.payment_method : "all"
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<SimplePaymentStatus | "all">(
    typeof searchParams.payment_status === "string" &&
      ["unpaid", "paid", "refunded", "waived"].includes(searchParams.payment_status)
      ? (searchParams.payment_status as SimplePaymentStatus)
      : "all"
  );
  const [sortField, setSortField] = useState(
    typeof searchParams.sort === "string" ? searchParams.sort : "created_at"
  );
  const [sortOrder, setSortOrder] = useState(searchParams.order === "asc" ? "asc" : "desc");

  // 検索パラメータが変更されたときに内部状態を同期
  useEffect(() => {
    setSearchQuery(typeof searchParams.search === "string" ? searchParams.search : "");
    setPaymentMethodFilter(
      typeof searchParams.payment_method === "string" ? searchParams.payment_method : "all"
    );
    setPaymentStatusFilter(
      typeof searchParams.payment_status === "string" &&
        ["unpaid", "paid", "refunded", "waived"].includes(searchParams.payment_status)
        ? (searchParams.payment_status as SimplePaymentStatus)
        : "all"
    );
    setSortField(typeof searchParams.sort === "string" ? searchParams.sort : "created_at");
    setSortOrder(searchParams.order === "asc" ? "asc" : "desc");
  }, [searchParams]);

  // アクティブなフィルターの数を計算
  const activeFiltersCount = [
    searchQuery,
    !isFreeEvent && paymentMethodFilter !== "all" ? paymentMethodFilter : null,
    !isFreeEvent && paymentStatusFilter !== "all" ? paymentStatusFilter : null,
  ].filter(Boolean).length;

  const handleApplyFilters = () => {
    onFiltersChange({
      search: searchQuery || undefined,
      payment_method: paymentMethodFilter === "all" ? undefined : paymentMethodFilter,
      payment_status: paymentStatusFilter === "all" ? undefined : paymentStatusFilter,
      sort: sortField,
      order: sortOrder,
      page: "1",
    });
    setOpen(false);
  };

  const handleClearAllFilters = () => {
    setSearchQuery("");
    setPaymentMethodFilter("all");
    setPaymentStatusFilter("all");
    setSortField("created_at");
    setSortOrder("desc");

    onFiltersChange({
      search: undefined,
      payment_method: undefined,
      payment_status: undefined,
      sort: "created_at",
      order: "desc",
      page: "1",
    });
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">フィルター</span>
          {activeFiltersCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
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
          {/* 検索 */}
          <div className="space-y-2">
            <Label htmlFor="filter-search">ニックネーム検索</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="filter-search"
                placeholder="ニックネームで検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* 決済方法フィルター（有料イベントのみ） */}
          {!isFreeEvent && (
            <div className="space-y-2">
              <Label>決済方法</Label>
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="決済方法" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全て</SelectItem>
                  <SelectItem value="stripe">オンライン決済</SelectItem>
                  <SelectItem value="cash">現金決済</SelectItem>
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
              <Select value={sortField} onValueChange={setSortField}>
                <SelectTrigger>
                  <SelectValue placeholder="項目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">登録日時</SelectItem>
                  <SelectItem value="nickname">ニックネーム</SelectItem>
                  <SelectItem value="status">参加状況</SelectItem>
                  <SelectItem value="updated_at">更新日時</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger>
                  <SelectValue placeholder="順序" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">降順</SelectItem>
                  <SelectItem value="asc">昇順</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
