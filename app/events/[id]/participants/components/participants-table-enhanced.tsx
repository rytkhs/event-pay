"use client";

import React, { useState, useEffect } from "react";

import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  CreditCard,
  Banknote,
  Eye,
  EyeOff,
  Copy,
  UserPlus,
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
  GetEventPaymentsResponse,
} from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { generateGuestUrlAction } from "@/features/events/actions/generate-guest-url";
import { getAllCashPaymentIdsAction } from "@/features/events/actions/get-all-cash-payment-ids";

interface ParticipantsTableEnhancedProps {
  eventId: string;
  eventFee: number;
  participantsData: GetParticipantsResponse;
  paymentsData: GetEventPaymentsResponse;
  searchParams: { [key: string]: string | string[] | undefined };
  onFiltersChange: (params: Record<string, string | undefined>) => void;
}

export function ParticipantsTableEnhanced({
  eventId,
  eventFee,
  participantsData,
  paymentsData: _paymentsData,
  searchParams,
  onFiltersChange,
}: ParticipantsTableEnhancedProps) {
  const { toast } = useToast();
  const isFreeEvent = eventFee === 0;

  // ローカル状態管理
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [bulkUpdateMode, setBulkUpdateMode] = useState<"received" | "waived" | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  // レスポンシブでモバイルの場合はカードレイアウトに自動切り替え
  useEffect(() => {
    const checkScreenSize = () => {
      setViewMode(window.innerWidth < 768 ? "cards" : "table");
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // 現金決済のみをフィルター
  const cashPayments = participantsData.participants.filter(
    (p) => p.payment_method === "cash" && p.payment_id
  );

  // ページネーションハンドラー
  const handlePageChange = (newPage: number) => {
    onFiltersChange({ page: newPage.toString() });
  };

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
    } else {
      setSelectedPaymentIds([]);
    }
  };

  // 条件に合致する全件選択
  const handleSelectAllMatching = async () => {
    if (isSelectingAll) return;
    setIsSelectingAll(true);

    try {
      const filters = {
        search: typeof searchParams.search === "string" ? searchParams.search : undefined,
        attendanceStatus:
          typeof searchParams.attendance === "string" ? searchParams.attendance : undefined,
        paymentStatus:
          typeof searchParams.payment_status === "string" ? searchParams.payment_status : undefined,
      };

      const result = await getAllCashPaymentIdsAction({
        eventId,
        filters,
        max: 5000,
      });

      if (result.success) {
        if (result.paymentIds.length === 0) {
          setSelectedPaymentIds([]);
          toast({ title: "対象なし", description: "条件に一致する現金決済がありません。" });
          return;
        }

        setSelectedPaymentIds(result.paymentIds);
        toast({
          title: "全件選択",
          description: `${result.paymentIds.length}件を選択しました`,
        });
      } else {
        toast({
          title: "選択に失敗しました",
          description: result.error || "全件選択に失敗しました",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "選択に失敗しました",
        description: "全件選択でエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsSelectingAll(false);
    }
  };

  // 個別ステータス更新
  const handleUpdatePaymentStatus = async (paymentId: string, status: "received" | "waived") => {
    setIsUpdatingStatus(true);
    try {
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
        // ページリロードでデータ更新
        window.location.reload();
      } else {
        toast({
          title: "エラーが発生しました",
          description:
            typeof result.error === "string" ? result.error : "ステータス更新に失敗しました",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "エラーが発生しました",
        description: "ステータス更新に失敗しました",
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
          totalFailed += chunk.length;
        }
      }

      toast({
        title: "一括更新が完了しました",
        description: `${totalSuccess}件成功、${totalFailed}件失敗`,
      });
      setSelectedPaymentIds([]);
      // ページリロードでデータ更新
      window.location.reload();
    } catch (error) {
      toast({
        title: "エラーが発生しました",
        description: "一括更新に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStatus(false);
      setBulkUpdateMode(null);
    }
  };

  // ゲストURLコピー
  const handleCopyGuestUrl = async (attendanceId: string) => {
    try {
      const res = await generateGuestUrlAction({ eventId, attendanceId });
      if (!res.success) {
        toast({
          title: "コピーできません",
          description: res.error || "ゲストURL生成に失敗しました",
          variant: "destructive",
        });
        return;
      }
      await navigator.clipboard.writeText(res.data.guestUrl);
      toast({
        title: "URLをコピーしました",
        description: res.data.canOnlinePay
          ? "現在オンライン決済が可能です。"
          : res.data.reason || "オンライン決済は現在できません。",
      });
    } catch {
      toast({
        title: "コピーに失敗しました",
        description: "クリップボードにアクセスできませんでした",
        variant: "destructive",
      });
    }
  };

  // バッジ生成関数
  const getAttendanceStatusBadge = (status: string) => {
    switch (status) {
      case "attending":
        return (
          <Badge variant="default" className="bg-success/10 text-success border-success/20">
            ◯ 参加
          </Badge>
        );
      case "not_attending":
        return (
          <Badge
            variant="secondary"
            className="bg-destructive/10 text-destructive border-destructive/20"
          >
            ✕ 不参加
          </Badge>
        );
      case "maybe":
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
            △ 未定
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
          <Badge
            variant="outline"
            className="bg-purple-100 text-purple-800 flex items-center gap-1"
          >
            <CreditCard className="h-3 w-3" />
            オンライン
          </Badge>
        );
      case "cash":
        return (
          <Badge
            variant="outline"
            className="bg-orange-100 text-orange-800 flex items-center gap-1"
          >
            <Banknote className="h-3 w-3" />
            現金
          </Badge>
        );
      default:
        return <Badge variant="outline">{method}</Badge>;
    }
  };

  const { participants, pagination } = participantsData;

  return (
    <div className="space-y-4">
      {/* 一括操作バー */}
      {selectedPaymentIds.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-800">
                {selectedPaymentIds.length}件の現金決済を選択中
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
          </CardContent>
        </Card>
      )}

      {/* テーブル/カード切り替えボタンと一括選択 */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              参加者一覧（{pagination.total}件）
            </CardTitle>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllMatching}
                disabled={isSelectingAll}
              >
                {isSelectingAll ? "全件選択中..." : "現金を全件選択"}
              </Button>

              <div className="flex items-center border rounded-lg">
                <Button
                  variant={viewMode === "table" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className="rounded-r-none"
                >
                  <Eye className="h-4 w-4" />
                  テーブル
                </Button>
                <Button
                  variant={viewMode === "cards" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("cards")}
                  className="rounded-l-none"
                >
                  <EyeOff className="h-4 w-4" />
                  カード
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {participants.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <UserPlus className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>参加者が見つかりません</p>
            </div>
          ) : viewMode === "table" ? (
            /* テーブルビュー（デスクトップ） */
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-[768px]">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <Checkbox
                        checked={
                          cashPayments.length > 0 &&
                          selectedPaymentIds.length ===
                            cashPayments.filter((p) => p.payment_id).length
                        }
                        onCheckedChange={handleSelectAll}
                        disabled={cashPayments.length === 0}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ニックネーム
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      参加状況
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
                  {participants.map((participant) => {
                    const isPaid = !isFreeEvent && isPaymentCompleted(participant.payment_status);
                    const simpleStatus = toSimplePaymentStatus(participant.payment_status);
                    const isCashPayment =
                      participant.payment_method === "cash" && participant.payment_id;
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
                              disabled={isUpdatingStatus}
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
                            {getPaymentMethodBadge(participant.payment_method)}
                          </td>
                        )}
                        {!isFreeEvent && (
                          <td className="px-4 py-4 whitespace-nowrap">
                            <Badge
                              variant={getSimplePaymentStatusStyle(simpleStatus).variant}
                              className={getSimplePaymentStatusStyle(simpleStatus).className}
                            >
                              {SIMPLE_PAYMENT_STATUS_LABELS[simpleStatus]}
                            </Badge>
                          </td>
                        )}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {isCashPayment &&
                              simpleStatus !== "paid" &&
                              simpleStatus !== "waived" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      hasPaymentId(participant) &&
                                      handleUpdatePaymentStatus(participant.payment_id, "received")
                                    }
                                    disabled={isUpdatingStatus}
                                    className="h-8 px-2 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    受領
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      hasPaymentId(participant) &&
                                      handleUpdatePaymentStatus(participant.payment_id, "waived")
                                    }
                                    disabled={isUpdatingStatus}
                                    className="h-8 px-2 text-xs bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                                  >
                                    <X className="h-3 w-3 mr-1" />
                                    免除
                                  </Button>
                                </>
                              )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCopyGuestUrl(participant.attendance_id)}
                              className="h-8 px-2 text-xs"
                              title="ゲスト用URLをコピー"
                              disabled={participant.status !== "attending"}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              URL
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* カードビュー（モバイル） */
            <div className="space-y-3">
              {participants.map((participant) => {
                const isPaid = !isFreeEvent && isPaymentCompleted(participant.payment_status);
                const simpleStatus = toSimplePaymentStatus(participant.payment_status);
                const isCashPayment =
                  participant.payment_method === "cash" && participant.payment_id;
                const isSelected = participant.payment_id
                  ? selectedPaymentIds.includes(participant.payment_id)
                  : false;

                return (
                  <Card
                    key={participant.attendance_id}
                    className={`${isPaid ? "border-green-200 bg-green-50" : ""} ${
                      isSelected ? "ring-2 ring-blue-500" : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {isCashPayment && (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked: boolean) =>
                                  hasPaymentId(participant) &&
                                  handleSelectPayment(participant.payment_id, checked)
                                }
                                disabled={isUpdatingStatus}
                              />
                            )}
                            <h4 className="font-medium text-gray-900">{participant.nickname}</h4>
                            {getAttendanceStatusBadge(participant.status)}
                          </div>

                          {!isFreeEvent && (
                            <div className="flex items-center gap-3 mb-3">
                              {getPaymentMethodBadge(participant.payment_method)}
                              <Badge
                                variant={getSimplePaymentStatusStyle(simpleStatus).variant}
                                className={getSimplePaymentStatusStyle(simpleStatus).className}
                              >
                                {SIMPLE_PAYMENT_STATUS_LABELS[simpleStatus]}
                              </Badge>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            {isCashPayment &&
                              simpleStatus !== "paid" &&
                              simpleStatus !== "waived" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      hasPaymentId(participant) &&
                                      handleUpdatePaymentStatus(participant.payment_id, "received")
                                    }
                                    disabled={isUpdatingStatus}
                                    className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    受領
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      hasPaymentId(participant) &&
                                      handleUpdatePaymentStatus(participant.payment_id, "waived")
                                    }
                                    disabled={isUpdatingStatus}
                                    className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                                  >
                                    <X className="h-3 w-3 mr-1" />
                                    免除
                                  </Button>
                                </>
                              )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCopyGuestUrl(participant.attendance_id)}
                              disabled={participant.status !== "attending"}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              URL
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* ページネーション */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {pagination.total}件中 {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}件を表示
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                  前へ
                </Button>

                <span className="text-sm px-3 py-1 bg-gray-100 rounded">
                  {pagination.page} / {pagination.totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                >
                  次へ
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
