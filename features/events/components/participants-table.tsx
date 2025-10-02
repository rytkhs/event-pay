"use client";

import React, { useState, useEffect } from "react";

// HTMLテーブルを使用するため、外部Tableコンポーネントは不要
import {
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Check,
  X,
  CreditCard,
  Banknote,
  MoreVertical,
} from "lucide-react";

import { useToast } from "@core/contexts/toast-context";
import { getPaymentActions } from "@core/services";
import { extractValidPaymentIds, hasPaymentId } from "@core/utils/data-guards";
import {
  toSimplePaymentStatus,
  isPaymentCompleted,
  SIMPLE_PAYMENT_STATUS_LABELS,
  getSimplePaymentStatusStyle,
} from "@core/utils/payment-status-mapper";
import type {
  GetParticipantsResponse,
  GetParticipantsParams,
} from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

import { exportParticipantsCsvAction } from "../actions/export-participants-csv";
import { generateGuestUrlAction } from "../actions/generate-guest-url";
import { getAllCashPaymentIdsAction } from "../actions/get-all-cash-payment-ids";

interface ParticipantsTableProps {
  eventId: string;
  eventFee: number;
  initialData: GetParticipantsResponse;
  onParamsChange: (params: Partial<GetParticipantsParams>) => void;
  isLoading?: boolean;
  onPaymentStatusUpdate?: () => void;
}

export function ParticipantsTable({
  eventId,
  eventFee,
  initialData,
  onParamsChange,
  isLoading = false,
  onPaymentStatusUpdate,
}: ParticipantsTableProps) {
  const { toast } = useToast();

  // 無料イベントかどうかの判定
  const isFreeEvent = eventFee === 0;

  // 選択機能のstate
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [bulkUpdateMode, setBulkUpdateMode] = useState<"received" | "waived" | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [selectionMeta, setSelectionMeta] = useState<{
    mode: "page" | "all" | null;
    total?: number;
    truncated?: boolean;
  }>({ mode: null });
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
    // ページ・フィルタ変更時は選択状態をリセットし誤操作を防止
    setSelectedPaymentIds([]);
    setSelectionMeta({ mode: null });
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
          : (value as "unpaid" | "paid" | "refunded" | "waived" | "canceled"),
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

  // 現金決済のみをフィルター
  const cashPayments = initialData.participants.filter(
    (p) => p.payment_method === "cash" && p.payment_id
  );

  // 選択機能ハンドラー
  const handleSelectPayment = (paymentId: string, checked: boolean) => {
    setSelectedPaymentIds((prev) =>
      checked ? [...prev, paymentId] : prev.filter((id) => id !== paymentId)
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const cashPaymentIds = extractValidPaymentIds(cashPayments);
      setSelectedPaymentIds(cashPaymentIds);
      setSelectionMeta({ mode: "page" });
    } else {
      setSelectedPaymentIds([]);
      setSelectionMeta({ mode: null });
    }
  };

  // 条件に合致する「現金」全件を選択
  const handleSelectAllMatching = async () => {
    if (isSelectingAll) return;
    setIsSelectingAll(true);
    try {
      const filters = {
        search: searchQuery || undefined,
        attendanceStatus: attendanceFilter === "all" ? undefined : attendanceFilter || undefined,
        paymentStatus: paymentStatusFilter === "all" ? undefined : paymentStatusFilter || undefined,
      };

      const result = await getAllCashPaymentIdsAction({
        eventId,
        filters,
        max: 5000,
      });

      if (result.success) {
        if (result.paymentIds.length === 0) {
          setSelectedPaymentIds([]);
          setSelectionMeta({ mode: null });
          toast({ title: "対象なし", description: "条件に一致する現金決済がありません。" });
          return;
        }

        setSelectedPaymentIds(result.paymentIds);
        setSelectionMeta({
          mode: "all",
          total:
            "matchedTotal" in result && typeof result.matchedTotal === "number"
              ? result.matchedTotal
              : result.total,
          truncated: Boolean(result.truncated),
        });

        toast({
          title: "全件選択",
          description: `${result.paymentIds.length}件を選択しました${
            "matchedTotal" in result && typeof result.matchedTotal === "number"
              ? `（取得: ${result.paymentIds.length}件 / 該当: ${result.matchedTotal}件${result.truncated ? "、上限まで" : ""}）`
              : `（取得: ${result.paymentIds.length}件${result.truncated ? "、上限まで" : ""}）`
          }`,
        });
      } else {
        toast({
          title: "選択に失敗しました",
          description: result.error || "全件選択に失敗しました",
          variant: "destructive",
        });
      }
    } catch (_e) {
      toast({
        title: "選択に失敗しました",
        description: "全件選択でエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsSelectingAll(false);
    }
  };

  // Payment Actions実装の動的登録を確保
  const ensurePaymentActionsRegistration = async () => {
    try {
      // PaymentActions実装を動的にインポートして登録
      await import("@features/payments/core-bindings");
    } catch (error) {
      console.error("Failed to register PaymentActions implementation:", error);
      throw new Error("PaymentActions initialization failed");
    }
  };

  // 個別ステータス更新
  const handleUpdatePaymentStatus = async (paymentId: string, status: "received" | "waived") => {
    setIsUpdatingStatus(true);
    try {
      // Payment Actions実装の登録を確保
      await ensurePaymentActionsRegistration();

      const paymentActions = getPaymentActions();
      const result = await paymentActions.updateCashStatus({
        paymentId,
        status,
      });

      if (result.success) {
        toast({
          title: "ステータスを更新しました",
          description: `決済ステータスを「${status === "received" ? "受領済み" : "免除"}」に更新しました`,
        });
        onPaymentStatusUpdate?.();
      } else {
        // 競合エラーの場合は特別な処理
        if (
          result.error &&
          typeof result.error === "object" &&
          "code" in result.error &&
          (result.error as { code: string }).code === "CONFLICT"
        ) {
          toast({
            title: "同時更新が検出されました",
            description:
              "他のユーザーによって同時に更新されました。画面を更新して最新状態を確認してください。",
            variant: "destructive",
          });
          // 自動的に最新データを再取得
          setTimeout(() => {
            onPaymentStatusUpdate?.();
          }, 1000);
        } else {
          toast({
            title: "エラーが発生しました",
            description:
              typeof result.error === "string" ? result.error : "ステータス更新に失敗しました",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "予期しないエラーが発生しました";
      toast({
        title: "ステータス更新エラー",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // 一括ステータス更新
  const handleBulkUpdate = async (status: "received" | "waived") => {
    if (selectedPaymentIds.length === 0) {
      toast({
        title: "選択エラー",
        description: "更新する決済を選択してください",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingStatus(true);
    setBulkUpdateMode(status);

    try {
      // Payment Actions実装の登録を確保
      await ensurePaymentActionsRegistration();

      // 50件ずつチャンクして順次実行
      const chunkSize = 50;
      let totalSuccess = 0;
      let totalFailed = 0;

      for (let i = 0; i < selectedPaymentIds.length; i += chunkSize) {
        const chunk = selectedPaymentIds.slice(i, i + chunkSize);
        const paymentActions = getPaymentActions();
        const result = await paymentActions.bulkUpdateCashStatus({ paymentIds: chunk, status });

        if (result.success) {
          totalSuccess += result.data.successCount;
          totalFailed += result.data.failedCount;
        } else {
          // 競合専用メッセージ
          if (
            result.error &&
            typeof result.error === "object" &&
            "code" in result.error &&
            (result.error as { code: string }).code === "CONFLICT"
          ) {
            toast({
              title: "同時更新が検出されました",
              description: "他のユーザーによって同時に更新されました。最新状態を取得します。",
              variant: "destructive",
            });
            // 次のチャンク処理は継続しつつ、後で最新再取得
          } else {
            // 失敗として件数加算（このチャンク分）
            totalFailed += chunk.length;
          }
        }
      }

      toast({
        title: "一括更新が完了しました",
        description: `${totalSuccess}件成功、${totalFailed}件失敗`,
      });
      setSelectedPaymentIds([]);
      onPaymentStatusUpdate?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "予期しないエラーが発生しました";
      toast({
        title: "一括更新エラー",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStatus(false);
      setBulkUpdateMode(null);
    }
  };

  // ステータスバッジのスタイル
  const getAttendanceStatusBadge = (status: string) => {
    switch (status) {
      case "attending":
        return (
          <Badge variant="default" className="bg-success/10 text-success border-success/20 text-md">
            ◯
          </Badge>
        );
      case "not_attending":
        return (
          <Badge
            variant="secondary"
            className="bg-destructive/10 text-destructive border-destructive/20 text-md"
          >
            ✕
          </Badge>
        );
      case "maybe":
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-md">
            △
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
          <div className="inline-flex">
            <Badge
              variant="outline"
              className="bg-purple-100 text-purple-800 flex items-center gap-1"
            >
              <CreditCard className="h-5 w-5" />
              オンライン
            </Badge>
          </div>
        );
      case "cash":
        return (
          <div className="inline-flex">
            <Badge
              variant="outline"
              className="bg-orange-100 text-orange-800 flex items-center gap-1"
            >
              <Banknote className="h-5 w-5" />
              現金
            </Badge>
          </div>
        );
      default:
        return <Badge variant="outline">{method}</Badge>;
    }
  };

  // CSVエクスポートハンドラー
  const handleExportCsv = async () => {
    if (isExporting) return;

    setIsExporting(true);

    try {
      // 注意喚起トースト
      toast({
        title: "CSV エクスポート",
        description: "個人情報の取り扱いには十分注意してください。(最大 1,000 件まで) ",
        duration: 3000,
      });

      // 現在のフィルター条件でエクスポート
      const filters = {
        search: searchQuery || undefined,
        attendanceStatus: attendanceFilter === "all" ? undefined : attendanceFilter || undefined,
        paymentMethod: paymentMethodFilter === "all" ? undefined : paymentMethodFilter || undefined,
        paymentStatus: paymentStatusFilter === "all" ? undefined : paymentStatusFilter || undefined,
      };

      const result = await exportParticipantsCsvAction({
        eventId,
        filters,
      });

      if (result.success) {
        if (result.csvContent && result.csvContent.length > 0) {
          // CSVファイルをダウンロード
          const blob = new Blob([result.csvContent], { type: "text/csv;charset=utf-8;" });
          const link = document.createElement("a");
          const url = URL.createObjectURL(blob);

          link.setAttribute("href", url);
          link.setAttribute("download", result.filename ?? "participants.csv");
          link.style.visibility = "hidden";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          toast({
            title: "エクスポート完了",
            description: `${result.filename ?? "participants.csv"} をダウンロードしました。`,
          });

          if (result.truncated) {
            toast({
              title: "注意: 一部データを省略",
              description:
                "1,001 件以上のデータが存在したため、先頭 1,000 件のみを出力しました。フィルターで範囲を絞って再度エクスポートしてください。",
            });
          }
        } else {
          // 対象 0 件
          toast({
            title: "対象データなし",
            description: "エクスポート対象の参加者がいませんでした。",
          });
        }
      } else {
        toast({
          title: "エクスポート失敗",
          description: result.error || "CSVエクスポートに失敗しました。",
          variant: "destructive",
        });
      }
    } catch (_error) {
      toast({
        title: "エクスポート失敗",
        description: "CSVエクスポートでエラーが発生しました。",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const { participants, pagination } = initialData;

  // ゲストURLコピー
  const handleCopyGuestUrl = async (attendanceId: string) => {
    try {
      const res = await generateGuestUrlAction({ eventId, attendanceId });
      if (!res.success) {
        toast({
          title: "URLの生成に失敗しました",
          description: res.error || "ゲストURL生成に失敗しました",
          variant: "destructive",
        });
        return;
      }

      try {
        await navigator.clipboard.writeText(res.data.guestUrl);
        toast({
          title: "URLをコピーしました",
          description: res.data.canOnlinePay
            ? "現在オンライン決済が可能です。"
            : res.data.reason || "オンライン決済は現在できません。",
        });
      } catch (clipboardError) {
        // クリップボードアクセスエラーは別途処理
        toast({
          title: "クリップボードアクセスエラー",
          description:
            "URLは生成されましたが、コピーできませんでした。ブラウザの設定を確認してください。",
          variant: "destructive",
        });
      }
    } catch (error) {
      // generateGuestUrlAction自体のエラー
      const errorMessage =
        error instanceof Error ? error.message : "予期しないエラーが発生しました";
      toast({
        title: "URLの生成に失敗しました",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardTitle className="flex items-center gap-2">
            参加者一覧
            {isLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAllMatching}
              disabled={isLoading || isSelectingAll}
            >
              {isSelectingAll ? "全件選択中..." : "条件に合う現金を全件選択"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={isLoading || isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "エクスポート中..." : "CSV出力"}
            </Button>
          </div>
        </div>

        {/* 一括操作バー */}
        {selectedPaymentIds.length > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md p-3">
            <span className="text-sm text-blue-800">
              {selectedPaymentIds.length}件の現金決済を選択中
              {selectionMeta.mode === "all" && (
                <span className="ml-2 text-xs text-blue-700">
                  （全件選択
                  {typeof selectionMeta.total === "number" ? `: 該当 ${selectionMeta.total}件` : ""}
                  {selectionMeta.truncated ? "、上限まで" : ""}）
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleBulkUpdate("received")}
                disabled={isUpdatingStatus}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4 mr-1" />
                {bulkUpdateMode === "received" && isUpdatingStatus ? "処理中..." : "一括受領"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkUpdate("waived")}
                disabled={isUpdatingStatus}
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
              >
                <X className="h-4 w-4 mr-1" />
                {bulkUpdateMode === "waived" && isUpdatingStatus ? "処理中..." : "一括免除"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedPaymentIds([])}
                disabled={isUpdatingStatus}
              >
                選択解除
              </Button>
            </div>
          </div>
        )}

        {/* 検索・フィルターエリア */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* 検索 */}
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ニックネームで検索..."
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
            <Filter className="h-4 w-4 text-muted-foreground" />

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

            {!isFreeEvent && (
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
            )}

            {!isFreeEvent && (
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
                  <SelectItem value="pending">未決済</SelectItem>
                  <SelectItem value="failed">失敗</SelectItem>
                  <SelectItem value="refunded">返金済み</SelectItem>
                  <SelectItem value="waived">免除</SelectItem>
                  <SelectItem value="canceled">キャンセル済み</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* テーブル */}
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full min-w-[768px]">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <Checkbox
                    checked={
                      cashPayments.length > 0 &&
                      selectedPaymentIds.length === cashPayments.filter((p) => p.payment_id).length
                    }
                    onCheckedChange={handleSelectAll}
                    disabled={isLoading || cashPayments.length === 0}
                  />
                </th>
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
                  onClick={() => handleSort("status")}
                >
                  参加状況
                  {currentSort.field === "status" && (
                    <span className="ml-1">{currentSort.order === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
                {!isFreeEvent && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    決済方法
                  </th>
                )}
                {!isFreeEvent && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    決済状況
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  アクション
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={isFreeEvent ? 4 : 6} className="px-4 py-8 text-center text-gray-500">
                    {isLoading ? "読み込み中..." : "参加者が見つかりません"}
                  </td>
                </tr>
              ) : (
                participants.map((participant) => {
                  // 決済済みのハイライト判定（無料イベントではハイライトしない）
                  const isPaid = !isFreeEvent && isPaymentCompleted(participant.payment_status);
                  const simpleStatus = toSimplePaymentStatus(participant.payment_status);
                  const isCanceledPayment = participant.payment_status === "canceled";

                  const isCashPayment =
                    participant.payment_method === "cash" &&
                    participant.payment_id &&
                    !isCanceledPayment;
                  const isSelected = participant.payment_id
                    ? selectedPaymentIds.includes(participant.payment_id)
                    : false;

                  return (
                    <tr
                      key={participant.attendance_id}
                      className={`${isPaid ? "bg-green-50 border-l-4 !border-l-green-200" : ""}`}
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        {isCashPayment ? (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked: boolean) =>
                              hasPaymentId(participant) &&
                              handleSelectPayment(participant.payment_id, checked)
                            }
                            disabled={isLoading || isUpdatingStatus}
                          />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap font-medium text-gray-900">
                        {participant.nickname}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {getAttendanceStatusBadge(participant.status)}
                      </td>
                      {!isFreeEvent && (
                        <td className="px-4 py-4 whitespace-nowrap">
                          {isCanceledPayment ? (
                            <span className="text-gray-400">-</span>
                          ) : (
                            getPaymentMethodBadge(participant.payment_method)
                          )}
                        </td>
                      )}
                      {!isFreeEvent && (
                        <td className="px-4 py-4 whitespace-nowrap">
                          {isCanceledPayment ? (
                            <span className="text-gray-400">-</span>
                          ) : (
                            <Badge
                              variant={getSimplePaymentStatusStyle(simpleStatus).variant}
                              className={getSimplePaymentStatusStyle(simpleStatus).className}
                            >
                              {SIMPLE_PAYMENT_STATUS_LABELS[simpleStatus]}
                            </Badge>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {/* 最頻用アクション：受領（現金決済で未完了時のみ直接表示） */}
                          {isCashPayment &&
                            simpleStatus !== "paid" &&
                            simpleStatus !== "waived" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  hasPaymentId(participant) &&
                                  handleUpdatePaymentStatus(participant.payment_id, "received")
                                }
                                disabled={isUpdatingStatus}
                                className="h-8 w-8 p-0 bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                title="受領済みにする"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            )}

                          {/* その他のアクション */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-gray-100"
                                title="その他のアクション"
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              {/* 免除アクション（現金決済で未完了時のみ） */}
                              {isCashPayment &&
                                simpleStatus !== "paid" &&
                                simpleStatus !== "waived" && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      hasPaymentId(participant) &&
                                      handleUpdatePaymentStatus(participant.payment_id, "waived")
                                    }
                                    disabled={isUpdatingStatus}
                                    className="text-orange-700 focus:text-orange-700"
                                  >
                                    <X className="h-3 w-3 mr-2" />
                                    支払いを免除
                                  </DropdownMenuItem>
                                )}

                              {/* URLコピーアクション */}
                              <DropdownMenuItem
                                onClick={() => handleCopyGuestUrl(participant.attendance_id)}
                                disabled={participant.status !== "attending"}
                                className="text-blue-700 focus:text-blue-700"
                              >
                                <span className="h-3 w-3 mr-2">🔗</span>
                                URLをコピー
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ページネーション */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
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
