"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// HTMLテーブルを使用するため、外部Tableコンポーネントは不要
import { Search, Filter, Download, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import type {
  GetParticipantsResponse,
  GetParticipantsParams,
} from "@/lib/validation/participant-management";

interface ParticipantsTableProps {
  eventId: string;
  initialData: GetParticipantsResponse;
  onParamsChange: (params: Partial<GetParticipantsParams>) => void;
  isLoading?: boolean;
}

export function ParticipantsTable({
  initialData,
  onParamsChange,
  isLoading = false,
}: ParticipantsTableProps) {
  const [searchQuery, setSearchQuery] = useState(initialData.filters.search || "");
  const [attendanceFilter, setAttendanceFilter] = useState<string>(
    initialData.filters.attendanceStatus || ""
  );
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>(
    initialData.filters.paymentMethod || ""
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>(
    initialData.filters.paymentStatus || ""
  );
  const [currentSort, setCurrentSort] = useState({
    field: initialData.sort.field,
    order: initialData.sort.order,
  });

  // Props変更時にローカルstateを同期
  useEffect(() => {
    setSearchQuery(initialData.filters.search || "");
    setAttendanceFilter(initialData.filters.attendanceStatus || "");
    setPaymentMethodFilter(initialData.filters.paymentMethod || "");
    setPaymentStatusFilter(initialData.filters.paymentStatus || "");
    setCurrentSort({
      field: initialData.sort.field,
      order: initialData.sort.order,
    });
  }, [initialData]);

  // フィルターハンドラー
  const handleSearch = () => {
    onParamsChange({
      search: searchQuery || undefined,
      page: 1, // 検索時はページを1に戻す
    });
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    onParamsChange({ search: undefined, page: 1 });
  };

  const handleAttendanceFilter = (value: string) => {
    setAttendanceFilter(value);
    onParamsChange({
      attendanceStatus:
        value === "all" ? undefined : (value as "attending" | "not_attending" | "maybe"),
      page: 1,
    });
  };

  const handlePaymentMethodFilter = (value: string) => {
    setPaymentMethodFilter(value);
    onParamsChange({
      paymentMethod: value === "all" ? undefined : (value as "stripe" | "cash"),
      page: 1,
    });
  };

  const handlePaymentStatusFilter = (value: string) => {
    setPaymentStatusFilter(value);
    onParamsChange({
      paymentStatus:
        value === "all"
          ? undefined
          : (value as
              | "pending"
              | "paid"
              | "failed"
              | "received"
              | "refunded"
              | "waived"
              | "completed"),
      page: 1,
    });
  };

  // ソートハンドラー
  const handleSort = (field: GetParticipantsParams["sortField"]) => {
    const newOrder: "asc" | "desc" =
      currentSort.field === field && currentSort.order === "desc" ? "asc" : "desc";
    const newSort = { field, order: newOrder };
    setCurrentSort(newSort);
    onParamsChange({
      sortField: field,
      sortOrder: newOrder,
      page: 1,
    });
  };

  // ページネーションハンドラー
  const handlePageChange = (newPage: number) => {
    onParamsChange({ page: newPage });
  };

  // ステータスバッジのスタイル
  const getAttendanceStatusBadge = (status: string) => {
    switch (status) {
      case "attending":
        return (
          <Badge variant="default" className="bg-blue-100 text-blue-800">
            参加予定
          </Badge>
        );
      case "not_attending":
        return (
          <Badge variant="secondary" className="bg-red-100 text-red-800">
            不参加
          </Badge>
        );
      case "maybe":
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
            未定
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string | null) => {
    if (!status)
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-600">
          未登録
        </Badge>
      );

    switch (status) {
      case "paid":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            支払済み
          </Badge>
        );
      case "received":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            受領済み
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            完了
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
            未決済
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="secondary" className="bg-red-100 text-red-800">
            失敗
          </Badge>
        );
      case "refunded":
        return (
          <Badge variant="secondary" className="bg-red-100 text-red-800">
            返金済み
          </Badge>
        );
      case "waived":
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-600">
            免除
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentMethodBadge = (method: string | null) => {
    if (!method) return null;

    switch (method) {
      case "stripe":
        return (
          <Badge variant="outline" className="bg-purple-100 text-purple-800">
            カード
          </Badge>
        );
      case "cash":
        return (
          <Badge variant="outline" className="bg-orange-100 text-orange-800">
            現金
          </Badge>
        );
      default:
        return <Badge variant="outline">{method}</Badge>;
    }
  };

  // 日付フォーマット
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(parseISO(dateString), "MM/dd HH:mm", { locale: ja });
    } catch {
      return "-";
    }
  };

  // 金額フォーマット
  const formatAmount = (amount: number | null) => {
    if (amount === null) return "-";
    return `¥${amount.toLocaleString()}`;
  };

  const { participants, pagination } = initialData;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardTitle className="flex items-center gap-2">
            参加者一覧
            {isLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={isLoading}>
              <Download className="h-4 w-4 mr-2" />
              CSV出力
            </Button>
          </div>
        </div>

        {/* 検索・フィルターエリア */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* 検索 */}
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="ニックネーム、メールで検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10"
                disabled={isLoading}
              />
            </div>
            <Button onClick={handleSearch} size="sm" disabled={isLoading}>
              検索
            </Button>
            {(searchQuery || initialData.filters.search) && (
              <Button onClick={handleClearSearch} variant="outline" size="sm" disabled={isLoading}>
                クリア
              </Button>
            )}
          </div>

          {/* フィルター */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />

            <Select
              value={attendanceFilter}
              onValueChange={handleAttendanceFilter}
              disabled={isLoading}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="参加状況" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全て</SelectItem>
                <SelectItem value="attending">参加予定</SelectItem>
                <SelectItem value="not_attending">不参加</SelectItem>
                <SelectItem value="maybe">未定</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={paymentMethodFilter}
              onValueChange={handlePaymentMethodFilter}
              disabled={isLoading}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="決済方法" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全て</SelectItem>
                <SelectItem value="stripe">カード</SelectItem>
                <SelectItem value="cash">現金</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={paymentStatusFilter}
              onValueChange={handlePaymentStatusFilter}
              disabled={isLoading}
            >
              <SelectTrigger className="w-[120px]">
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
        </div>
      </CardHeader>

      <CardContent>
        {/* テーブル */}
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("nickname")}
                >
                  ニックネーム
                  {currentSort.field === "nickname" && (
                    <span className="ml-1">{currentSort.order === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("email")}
                >
                  メール
                  {currentSort.field === "email" && (
                    <span className="ml-1">{currentSort.order === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("status")}
                >
                  参加状況
                  {currentSort.field === "status" && (
                    <span className="ml-1">{currentSort.order === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  決済方法
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  決済状況
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  金額
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("paid_at")}
                >
                  決済日時
                  {currentSort.field === "paid_at" && (
                    <span className="ml-1">{currentSort.order === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("updated_at")}
                >
                  更新日時
                  {currentSort.field === "updated_at" && (
                    <span className="ml-1">{currentSort.order === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {isLoading ? "読み込み中..." : "参加者が見つかりません"}
                  </td>
                </tr>
              ) : (
                participants.map((participant) => (
                  <tr key={participant.attendance_id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap font-medium text-gray-900">
                      {participant.nickname}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {participant.email}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getAttendanceStatusBadge(participant.attendance_status)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getPaymentMethodBadge(participant.payment_method)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getPaymentStatusBadge(participant.payment_status)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatAmount(participant.amount)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(participant.paid_at)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(participant.attendance_updated_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ページネーション */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              {pagination.total}件中 {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}件を表示
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={!pagination.hasPrev || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                前へ
              </Button>

              <span className="text-sm">
                {pagination.page} / {pagination.totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={!pagination.hasNext || isLoading}
              >
                次へ
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
