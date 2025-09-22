"use client";

import React, { useState, useEffect } from "react";

import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  CreditCard,
  Banknote,
  UserPlus,
  Copy,
  TableIcon,
  LayoutGridIcon,
  CheckCircle,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { generateGuestUrlAction } from "@/features/events/actions/generate-guest-url";

import { SmartBatchSelection } from "./smart-batch-selection";

interface ParticipantsTableEnhancedProps {
  eventId: string;
  eventFee: number;
  participantsData: GetParticipantsResponse;
  paymentsData: GetEventPaymentsResponse;
  searchParams: { [key: string]: string | string[] | undefined };
  onFiltersChange: (params: Record<string, string | undefined>) => void;
}

// バッジヘルパー関数
function getAttendanceStatusBadge(status: string) {
  const styles = {
    attending: {
      variant: "default" as const,
      className: "bg-success/10 text-success border-success/20",
      label: "◯ 参加",
    },
    not_attending: {
      variant: "secondary" as const,
      className: "bg-destructive/10 text-destructive border-destructive/20",
      label: "不参加",
    },
    maybe: {
      variant: "outline" as const,
      className: "bg-yellow-100 text-yellow-800 border-yellow-300",
      label: "△ 未定",
    },
  };

  const style = styles[status as keyof typeof styles] || styles.maybe;
  return (
    <Badge variant={style.variant} className={style.className}>
      {style.label}
    </Badge>
  );
}

function getPaymentMethodBadge(method: string | null) {
  if (!method) {
    return <span className="text-gray-400 text-sm">-</span>;
  }

  const styles = {
    stripe: { icon: CreditCard, label: "カード", className: "bg-purple-100 text-purple-800" },
    cash: { icon: Banknote, label: "現金", className: "bg-orange-100 text-orange-800" },
  };

  const style = styles[method as keyof typeof styles];
  if (!style) {
    return <span className="text-gray-400 text-sm">-</span>;
  }

  const Icon = style.icon;
  return (
    <Badge className={style.className}>
      <Icon className="h-3 w-3 mr-1" />
      {style.label}
    </Badge>
  );
}

export function ParticipantsTableEnhanced({
  eventId: _eventId,
  eventFee,
  participantsData,
  paymentsData: _paymentsData,
  searchParams: _searchParams,
  onFiltersChange,
}: ParticipantsTableEnhancedProps) {
  const { toast } = useToast();
  const isFreeEvent = eventFee === 0;

  // ローカル状態管理
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [isMobile, setIsMobile] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // 設定の永続化とレスポンシブ判定
  useEffect(() => {
    const savedViewMode = localStorage.getItem("event-participants-view-mode") as
      | "table"
      | "cards"
      | null;

    const checkScreenSize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (mobile) {
        setViewMode("cards");
      } else if (savedViewMode) {
        setViewMode(savedViewMode);
      }
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // View Mode変更時の永続化とアニメーション
  const handleViewModeChange = (newMode: "table" | "cards") => {
    if (newMode === viewMode) return;

    setIsTransitioning(true);

    // アニメーション開始
    setTimeout(() => {
      setViewMode(newMode);
      if (!isMobile) {
        localStorage.setItem("event-participants-view-mode", newMode);
      }

      setTimeout(() => setIsTransitioning(false), 200);
    }, 100);
  };

  // 参加者データ
  const participants = participantsData.participants;
  const pagination = participantsData.pagination;

  // 現金決済のみをフィルター
  const cashPayments = participants.filter((p) => p.payment_method === "cash" && p.payment_id);

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

  // 決済状況更新ハンドラー
  const handleUpdatePaymentStatus = async (paymentId: string, status: "received" | "waived") => {
    setIsUpdatingStatus(true);
    try {
      const { updateCashStatus } = getPaymentActions();
      const result = await updateCashStatus({ paymentId, status });

      if (result.success) {
        toast({
          title: "決済状況を更新しました",
          description: `ステータスを「${status === "received" ? "受領" : "免除"}」に変更しました。`,
        });
        // 再読み込みトリガー（親コンポーネントの責務）
        onFiltersChange({});
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "更新に失敗しました",
        description: "しばらく待ってから再度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // ゲストURL生成
  const handleCopyGuestUrl = async (attendanceId: string) => {
    try {
      const result = await generateGuestUrlAction(attendanceId);
      if (result.success) {
        await navigator.clipboard.writeText(result.data.guestUrl);
        toast({
          title: "URLをコピーしました",
          description: "参加者に共有してください。",
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "URLの生成に失敗しました",
        description: "しばらく待ってから再度お試しください。",
        variant: "destructive",
      });
    }
  };

  // 一括操作ハンドラー
  const handleBulkAction = async (action: "received" | "waived") => {
    if (selectedPaymentIds.length === 0) {
      toast({
        title: "選択してください",
        description: "操作する決済を選択してください。",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const { updateCashStatus } = getPaymentActions();

      const promises = selectedPaymentIds.map((id) =>
        updateCashStatus({ paymentId: id, status: action })
      );

      const results = await Promise.all(promises);
      const failures = results.filter((r: any) => !r.success);

      if (failures.length === 0) {
        toast({
          title: `${selectedPaymentIds.length}件を更新しました`,
          description: `ステータスを「${action === "received" ? "受領" : "免除"}」に変更しました。`,
        });
        setSelectedPaymentIds([]);
        onFiltersChange({});
      } else {
        toast({
          title: "一部の更新に失敗しました",
          description: `${results.length - failures.length}/${results.length}件が成功しました。`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "一括更新に失敗しました",
        description: "しばらく待ってから再度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              参加者一覧 ({pagination.total}件)
            </CardTitle>

            {/* View Toggle (デスクトップ・タブレットのみ) */}
            {!isMobile && (
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(value: "table" | "cards") => value && handleViewModeChange(value)}
                className="border rounded-md"
                aria-label="表示形式を選択"
              >
                <ToggleGroupItem value="table" aria-label="テーブル表示">
                  <TableIcon className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="cards" aria-label="カード表示">
                  <LayoutGridIcon className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>

          {/* Smart Batch Selection */}
          <SmartBatchSelection
            participants={participants}
            selectedPaymentIds={selectedPaymentIds}
            onSelectionChange={setSelectedPaymentIds}
            isFreeEvent={isFreeEvent}
            isUpdating={isUpdatingStatus}
          />

          {/* 一括操作ボタン（選択時のみ表示） */}
          {!isFreeEvent && selectedPaymentIds.length > 0 && (
            <Card className="border-orange-200 bg-orange-50/30">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                  <div className="flex items-center gap-2 text-orange-800">
                    <span className="font-medium">一括操作</span>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                      {selectedPaymentIds.length}件選択中
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkAction("received")}
                      disabled={isUpdatingStatus}
                      className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 min-h-[44px]"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      一括受領
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkAction("waived")}
                      disabled={isUpdatingStatus}
                      className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100 min-h-[44px]"
                    >
                      <X className="h-4 w-4 mr-1" />
                      一括免除
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {participants.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <UserPlus className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>参加者が見つかりません</p>
          </div>
        ) : (
          <div
            className={`transition-opacity duration-200 ${isTransitioning ? "opacity-50" : "opacity-100"}`}
          >
            {viewMode === "table" ? (
              /* テーブルビュー（Enhanced Touch Targets対応） */
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full" role="table" aria-label="参加者一覧テーブル">
                  <thead className="bg-muted/30">
                    <tr className="min-h-[48px]">
                      <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12 sm:w-16">
                        <Checkbox
                          checked={
                            cashPayments.length > 0 &&
                            selectedPaymentIds.length ===
                              cashPayments.filter((p) => p.payment_id).length
                          }
                          onCheckedChange={handleSelectAll}
                          disabled={cashPayments.length === 0}
                          className="h-5 w-5 touch-manipulation" // Enhanced touch target + touch optimization
                        />
                      </th>
                      <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ニックネーム
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        参加状況
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        決済方法
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        決済状況
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 sm:w-32">
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
                          className={`min-h-[48px] hover:bg-gray-50 ${
                            isPaid ? "bg-green-50 border-l-4 !border-l-green-200" : ""
                          }`}
                        >
                          {/* 選択列 */}
                          <td className="px-3 sm:px-4 py-3 sm:py-4 whitespace-nowrap">
                            {isCashPayment ? (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked: boolean) =>
                                  hasPaymentId(participant) &&
                                  handleSelectPayment(participant.payment_id, checked)
                                }
                                disabled={isUpdatingStatus}
                                className="h-5 w-5 touch-manipulation" // Enhanced touch target + touch optimization
                              />
                            ) : (
                              <span className="text-gray-400 text-xs sm:text-sm">-</span>
                            )}
                          </td>

                          {/* ニックネーム列 */}
                          <td className="px-3 sm:px-4 py-3 sm:py-4 whitespace-nowrap font-medium text-gray-900 text-sm sm:text-base">
                            {participant.nickname}
                          </td>

                          {/* 参加状況列 */}
                          <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap">
                            {getAttendanceStatusBadge(participant.status)}
                          </td>

                          {/* 決済方法列 */}
                          <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap">
                            {getPaymentMethodBadge(participant.payment_method)}
                          </td>

                          {/* 決済状況列 */}
                          <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap">
                            {!isFreeEvent && participant.payment_status ? (
                              <Badge
                                variant={getSimplePaymentStatusStyle(simpleStatus).variant}
                                className={getSimplePaymentStatusStyle(simpleStatus).className}
                              >
                                {SIMPLE_PAYMENT_STATUS_LABELS[simpleStatus]}
                              </Badge>
                            ) : (
                              <span className="text-gray-400 text-xs sm:text-sm">-</span>
                            )}
                          </td>

                          {/* アクション列 */}
                          <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              {/* 現金決済のクイックアクション */}
                              {isCashPayment &&
                                simpleStatus !== "paid" &&
                                simpleStatus !== "waived" && (
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        hasPaymentId(participant) &&
                                        handleUpdatePaymentStatus(
                                          participant.payment_id,
                                          "received"
                                        )
                                      }
                                      disabled={isUpdatingStatus}
                                      className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 min-h-[36px] sm:min-h-[32px] min-w-[36px] sm:min-w-[32px] px-1 sm:px-2 text-xs touch-manipulation"
                                    >
                                      <Check className="h-3 w-3 sm:h-3 sm:w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        hasPaymentId(participant) &&
                                        handleUpdatePaymentStatus(participant.payment_id, "waived")
                                      }
                                      disabled={isUpdatingStatus}
                                      className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100 min-h-[36px] sm:min-h-[32px] min-w-[36px] sm:min-w-[32px] px-1 sm:px-2 text-xs touch-manipulation"
                                    >
                                      <X className="h-3 w-3 sm:h-3 sm:w-3" />
                                    </Button>
                                  </div>
                                )}

                              {/* URL共有ボタン */}
                              {participant.status === "attending" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleCopyGuestUrl(participant.attendance_id)}
                                  className="min-h-[36px] sm:min-h-[32px] min-w-[36px] sm:min-w-[32px] px-1 sm:px-2 text-xs touch-manipulation"
                                >
                                  <Copy className="h-3 w-3 sm:h-3 sm:w-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* カードビュー（モバイル最適化） */
              <div
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                role="grid"
                aria-label="参加者一覧"
              >
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
                      className={`${isPaid ? "border-green-200 bg-green-50" : ""} transition-all duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-opacity-50`}
                      role="gridcell"
                      tabIndex={0}
                      aria-label={`参加者: ${participant.nickname}, ステータス: ${participant.status === "attending" ? "◯ 参加" : participant.status === "not_attending" ? "不参加" : "△ 未定"}`}
                    >
                      <CardContent className="p-4 sm:p-5">
                        <div className="space-y-4">
                          {/* ヘッダー部分 */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {/* 選択チェックボックス */}
                              {isCashPayment && (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked: boolean) =>
                                    hasPaymentId(participant) &&
                                    handleSelectPayment(participant.payment_id, checked)
                                  }
                                  disabled={isUpdatingStatus}
                                  className="h-5 w-5 touch-manipulation" // Enhanced touch target
                                />
                              )}

                              {/* 参加者名 */}
                              <h4 className="font-semibold text-gray-900 text-lg">
                                {participant.nickname}
                              </h4>
                            </div>

                            {/* 決済完了インジケーター */}
                            {isPaid && (
                              <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
                                <CheckCircle className="h-4 w-4" />
                                完了
                              </div>
                            )}
                          </div>

                          {/* バッジエリア */}
                          <div className="flex flex-wrap gap-2">
                            {getAttendanceStatusBadge(participant.status)}
                            {getPaymentMethodBadge(participant.payment_method)}
                            {!isFreeEvent && participant.payment_status && (
                              <Badge
                                variant={getSimplePaymentStatusStyle(simpleStatus).variant}
                                className={getSimplePaymentStatusStyle(simpleStatus).className}
                              >
                                {SIMPLE_PAYMENT_STATUS_LABELS[simpleStatus]}
                              </Badge>
                            )}
                          </div>

                          {/* アクションボタン群 */}
                          <div className="flex flex-wrap gap-3 pt-2">
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
                                    className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 min-h-[44px] touch-manipulation"
                                  >
                                    <Check className="h-4 w-4 mr-2" />
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
                                    className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100 min-h-[44px] touch-manipulation"
                                  >
                                    <X className="h-4 w-4 mr-2" />
                                    免除
                                  </Button>
                                </>
                              )}

                            {participant.status === "attending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopyGuestUrl(participant.attendance_id)}
                                className="min-h-[44px] touch-manipulation"
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                URL共有
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ページネーション */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 border-t">
            <div className="flex-1 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                {pagination.total}件中 {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}件を表示
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrev}
                  className="min-h-[44px] min-w-[44px] touch-manipulation" // Enhanced touch target + touch optimization
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <span className="text-sm text-gray-700 px-2 sm:px-3">
                  {pagination.page} / {pagination.totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                  className="min-h-[44px] min-w-[44px] touch-manipulation" // Enhanced touch target + touch optimization
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
