"use client";

import { useState, useEffect } from "react";

import { Search, X, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ParticipantsFiltersProps {
  searchParams: { [key: string]: string | string[] | undefined };
  onFiltersChange: (params: Record<string, string | undefined>) => void;
  isFreeEvent: boolean;
}

export function ParticipantsFilters({
  searchParams,
  onFiltersChange,
  isFreeEvent,
}: ParticipantsFiltersProps) {
  const [searchQuery, setSearchQuery] = useState(
    typeof searchParams.search === "string" ? searchParams.search : ""
  );
  const [attendanceFilter, setAttendanceFilter] = useState(
    typeof searchParams.attendance === "string" ? searchParams.attendance : "all"
  );
  const [paymentMethodFilter, setPaymentMethodFilter] = useState(
    typeof searchParams.payment_method === "string" ? searchParams.payment_method : "all"
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState(
    typeof searchParams.payment_status === "string" ? searchParams.payment_status : "all"
  );
  const [sortField, setSortField] = useState(
    typeof searchParams.sort === "string" ? searchParams.sort : "created_at"
  );
  const [sortOrder, setSortOrder] = useState(searchParams.order === "asc" ? "asc" : "desc");

  // 検索パラメータが変更されたときに内部状態を同期
  useEffect(() => {
    setSearchQuery(typeof searchParams.search === "string" ? searchParams.search : "");
    setAttendanceFilter(
      typeof searchParams.attendance === "string" ? searchParams.attendance : "all"
    );
    setPaymentMethodFilter(
      typeof searchParams.payment_method === "string" ? searchParams.payment_method : "all"
    );
    setPaymentStatusFilter(
      typeof searchParams.payment_status === "string" ? searchParams.payment_status : "all"
    );
    setSortField(typeof searchParams.sort === "string" ? searchParams.sort : "created_at");
    setSortOrder(searchParams.order === "asc" ? "asc" : "desc");
  }, [searchParams]);

  const handleSearch = () => {
    onFiltersChange({
      search: searchQuery || undefined,
      page: "1", // 検索時はページを1に戻す
    });
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    onFiltersChange({ search: undefined, page: "1" });
  };

  const handleAttendanceFilter = (value: string) => {
    setAttendanceFilter(value);
    onFiltersChange({
      attendance: value === "all" ? undefined : value,
      page: "1",
    });
  };

  const handlePaymentMethodFilter = (value: string) => {
    setPaymentMethodFilter(value);
    onFiltersChange({
      payment_method: value === "all" ? undefined : value,
      page: "1",
    });
  };

  const handlePaymentStatusFilter = (value: string) => {
    setPaymentStatusFilter(value);
    onFiltersChange({
      payment_status: value === "all" ? undefined : value,
      page: "1",
    });
  };

  const handleSortChange = (field: string, order: string) => {
    setSortField(field);
    setSortOrder(order);
    onFiltersChange({
      sort: field,
      order: order,
      page: "1",
    });
  };

  const handleClearAllFilters = () => {
    setSearchQuery("");
    setAttendanceFilter("all");
    setPaymentMethodFilter("all");
    setPaymentStatusFilter("all");
    setSortField("created_at");
    setSortOrder("desc");

    onFiltersChange({
      search: undefined,
      attendance: undefined,
      payment_method: undefined,
      payment_status: undefined,
      sort: "created_at",
      order: "desc",
      page: "1",
    });
  };

  // アクティブなフィルターの数を計算
  const activeFiltersCount = [
    searchQuery,
    attendanceFilter !== "all" ? attendanceFilter : null,
    !isFreeEvent && paymentMethodFilter !== "all" ? paymentMethodFilter : null,
    !isFreeEvent && paymentStatusFilter !== "all" ? paymentStatusFilter : null,
  ].filter(Boolean).length;

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-gray-900">フィルターと検索</span>
              {activeFiltersCount > 0 && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                  {activeFiltersCount}件適用中
                </span>
              )}
            </div>

            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAllFilters}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="h-4 w-4 mr-1" />
                すべてクリア
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 検索 */}
            <div className="space-y-2">
              <Label htmlFor="search">ニックネーム検索</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="ニックネームで検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="pl-10"
                  />
                </div>
                <Button onClick={handleSearch} size="sm">
                  検索
                </Button>
              </div>
              {searchQuery && (
                <Button
                  onClick={handleClearSearch}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-gray-500 p-0 h-auto"
                >
                  検索をクリア
                </Button>
              )}
            </div>

            {/* 参加状況フィルター */}
            <div className="space-y-2">
              <Label>参加状況</Label>
              <Select value={attendanceFilter} onValueChange={handleAttendanceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="参加状況" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全て</SelectItem>
                  <SelectItem value="attending">参加予定</SelectItem>
                  <SelectItem value="not_attending">不参加</SelectItem>
                  <SelectItem value="maybe">未定</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 決済方法フィルター（有料イベントのみ） */}
            {!isFreeEvent && (
              <div className="space-y-2">
                <Label>決済方法</Label>
                <Select value={paymentMethodFilter} onValueChange={handlePaymentMethodFilter}>
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
                <Select value={paymentStatusFilter} onValueChange={handlePaymentStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="決済状況" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    <SelectItem value="paid">支払済み</SelectItem>
                    <SelectItem value="received">受領済み</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                    <SelectItem value="pending">未決済</SelectItem>
                    <SelectItem value="failed">失敗</SelectItem>
                    <SelectItem value="refunded">返金済み</SelectItem>
                    <SelectItem value="waived">免除</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ソート設定 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>並び順</Label>
              <Select
                value={sortField}
                onValueChange={(value) => handleSortChange(value, sortOrder)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="並び順" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">登録日時</SelectItem>
                  <SelectItem value="nickname">ニックネーム</SelectItem>
                  <SelectItem value="status">参加状況</SelectItem>
                  <SelectItem value="updated_at">更新日時</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>順序</Label>
              <Select
                value={sortOrder}
                onValueChange={(value) => handleSortChange(sortField, value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="順序" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">降順（新しい順）</SelectItem>
                  <SelectItem value="asc">昇順（古い順）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
