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
  // Copy, // 一時的にコメントアウト
  TableIcon,
  LayoutGridIcon,
  CheckCircle,
  Circle,
  Triangle,
  RotateCcw,
} from "lucide-react";

import { useToast } from "@core/contexts/toast-context";
// import { getPaymentActions } from "@core/services";
import { hasPaymentId } from "@core/utils/data-guards";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { generateGuestUrlAction } from "@/features/events/actions/generate-guest-url";
import { updateCashStatusAction } from "@/features/payments/actions/update-cash-status";

interface ParticipantsTableEnhancedProps {
  eventId: string;
  eventFee: number;
  participantsData: GetParticipantsResponse;
  paymentsData: GetEventPaymentsResponse;
  searchParams: { [key: string]: string | string[] | undefined };
  onFiltersChange: (params: Record<string, string | undefined>) => void;
}

// 参加状況アイコンヘルパー関数
function getAttendanceStatusIcon(status: string) {
  const styles = {
    attending: {
      icon: Circle,
      className: "h-5 w-5 text-green-600",
      title: "参加",
    },
    not_attending: {
      icon: X,
      className: "h-5 w-5 text-red-600",
      title: "不参加",
    },
    maybe: {
      icon: Triangle,
      className: "h-5 w-5 text-yellow-600",
      title: "未定",
    },
  };

  const style = styles[status as keyof typeof styles] || styles.maybe;
  const Icon = style.icon;

  return (
    <div title={style.title}>
      <Icon className={`${style.className} mx-auto`} aria-label={style.title} />
    </div>
  );
}

// カードビュー用の参加状況バッジ（アイコン+テキスト）
function getAttendanceStatusBadgeWithIcon(status: string) {
  const styles = {
    attending: {
      icon: Circle,
      className: "bg-green-100 text-green-800 border-green-200 font-medium px-3 py-1 shadow-sm",
      label: "参加",
    },
    not_attending: {
      icon: X,
      className: "bg-red-100 text-red-800 border-red-200 font-medium px-3 py-1 shadow-sm",
      label: "不参加",
    },
    maybe: {
      icon: Triangle,
      className: "bg-yellow-100 text-yellow-800 border-yellow-300 font-medium px-3 py-1 shadow-sm",
      label: "未定",
    },
  };

  const style = styles[status as keyof typeof styles] || styles.maybe;
  const Icon = style.icon;

  return (
    <Badge className={style.className}>
      <Icon className="h-3 w-3 mr-1" />
      {style.label}
    </Badge>
  );
}

function getPaymentMethodBadge(method: string | null) {
  if (!method) {
    return <span className="text-gray-400 text-sm">-</span>;
  }

  const styles = {
    stripe: {
      icon: CreditCard,
      label: "オンライン決済",
      className: "bg-purple-100 text-purple-800 border-purple-200 font-medium px-3 py-1 shadow-sm",
    },
    cash: {
      icon: Banknote,
      label: "現金",
      className: "bg-orange-100 text-orange-800 border-orange-200 font-medium px-3 py-1 shadow-sm",
    },
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
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [_isMobile, setIsMobile] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelingPaymentId, setCancelingPaymentId] = useState<string | null>(null);

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
      localStorage.setItem("event-participants-view-mode", newMode);

      setTimeout(() => setIsTransitioning(false), 200);
    }, 100);
  };

  // 参加者データ
  const participants = participantsData.participants;
  const pagination = participantsData.pagination;

  // 現在のページサイズ（URLパラメータから取得、デフォルト50）
  const currentLimit = _searchParams.limit ? parseInt(String(_searchParams.limit), 10) : 50;

  // ページネーションハンドラー
  const handlePageChange = (newPage: number) => {
    onFiltersChange({ page: newPage.toString() });
  };

  // ページサイズ変更ハンドラー
  const handlePageSizeChange = (newLimit: string) => {
    onFiltersChange({ limit: newLimit, page: "1" }); // ページサイズ変更時はページを1にリセット
  };

  // 決済状況更新ハンドラー
  const handleUpdatePaymentStatus = async (paymentId: string, status: "received" | "waived") => {
    setIsUpdating(true);
    try {
      // 直接サーバーアクションを呼び出し（Next.jsのServer Actionsブリッジを使用）
      const result = await updateCashStatusAction({ paymentId, status });

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
      setIsUpdating(false);
    }
  };

  // 決済キャンセルハンドラー
  const handleCancelPaymentStatus = async (paymentId: string) => {
    setIsUpdating(true);
    try {
      const result = await updateCashStatusAction({
        paymentId,
        status: "pending",
        isCancel: true,
        notes: "管理者による決済取り消し",
      });

      if (result.success) {
        toast({
          title: "決済を取り消しました",
          description: "ステータスを「未決済」に戻しました。",
        });
        setCancelDialogOpen(false);
        setCancelingPaymentId(null);
        // 再読み込みトリガー（親コンポーネントの責務）
        onFiltersChange({});
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "取り消しに失敗しました",
        description: "しばらく待ってから再度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // 取り消しダイアログを開く
  const openCancelDialog = (paymentId: string) => {
    setCancelingPaymentId(paymentId);
    setCancelDialogOpen(true);
  };

  // ゲストURL生成
  const _handleCopyGuestUrl = async (attendanceId: string) => {
    try {
      const result = await generateGuestUrlAction({ eventId: _eventId, attendanceId });
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              参加者一覧 ({pagination.total}件)
            </CardTitle>

            {/* View Toggle */}
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
          </div>
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
              <div className="rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                <table className="w-full" role="table" aria-label="参加者一覧テーブル">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                    <tr className="min-h-[52px]">
                      <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                        <span className="hidden sm:inline">ニックネーム</span>
                        <span className="sm:hidden">名前</span>
                      </th>
                      <th className="px-3 sm:px-4 py-4 text-center text-sm font-semibold text-gray-700 uppercase tracking-wider">
                        <span className="hidden sm:inline">参加状況</span>
                        <span className="sm:hidden">参加</span>
                      </th>
                      <th className="px-3 sm:px-4 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                        <span className="hidden sm:inline">決済方法</span>
                        <span className="sm:hidden">方法</span>
                      </th>
                      <th className="px-3 sm:px-4 py-4 text-center text-sm font-semibold text-gray-700 uppercase tracking-wider">
                        <span className="hidden sm:inline">決済状況</span>
                        <span className="sm:hidden">状況</span>
                      </th>
                      <th className="px-3 sm:px-4 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider w-24 sm:w-32">
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

                      return (
                        <tr
                          key={participant.attendance_id}
                          className={`
                            min-h-[52px] transition-all duration-200
                            hover:bg-blue-50 hover:shadow-sm
                            ${isPaid ? "bg-green-50 border-l-4 border-l-green-500" : ""}
                            focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-opacity-50
                          `}
                          tabIndex={0}
                          role="row"
                        >
                          {/* ニックネーム列 */}
                          <td className="px-3 sm:px-4 py-3 sm:py-4 whitespace-nowrap font-medium text-gray-900 text-sm sm:text-base">
                            {participant.nickname}
                          </td>

                          {/* 参加状況列 */}
                          <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-center">
                            {getAttendanceStatusIcon(participant.status)}
                          </td>

                          {/* 決済方法列 */}
                          <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap">
                            {getPaymentMethodBadge(participant.payment_method)}
                          </td>

                          {/* 決済状況列 */}
                          <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-center">
                            {!isFreeEvent && participant.payment_status ? (
                              simpleStatus === "paid" ? (
                                <CheckCircle className="h-5 w-5 text-green-600 mx-auto" />
                              ) : (
                                <Badge
                                  variant={getSimplePaymentStatusStyle(simpleStatus).variant}
                                  className={`${getSimplePaymentStatusStyle(simpleStatus).className} font-medium px-3 py-1 shadow-sm`}
                                >
                                  {SIMPLE_PAYMENT_STATUS_LABELS[simpleStatus]}
                                </Badge>
                              )
                            ) : (
                              <span className="text-gray-400 text-xs sm:text-sm">-</span>
                            )}
                          </td>

                          {/* アクション列 */}
                          <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1 sm:gap-2">
                              {/* 受領ボタン（現金決済で未完了時のみ） */}
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
                                    disabled={isUpdating}
                                    className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 min-h-[36px] min-w-[36px] px-2 sm:px-3 shadow-sm hover:shadow-md transition-all duration-200 touch-manipulation"
                                    title="受領済みにする"
                                  >
                                    <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span className="hidden lg:inline ml-1 text-xs">受領</span>
                                  </Button>
                                )}

                              {/* 免除ボタン（現金決済で未完了時のみ） */}
                              {isCashPayment &&
                                simpleStatus !== "paid" &&
                                simpleStatus !== "waived" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      hasPaymentId(participant) &&
                                      handleUpdatePaymentStatus(participant.payment_id, "waived")
                                    }
                                    disabled={isUpdating}
                                    className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100 min-h-[36px] min-w-[36px] px-2 sm:px-3 shadow-sm hover:shadow-md transition-all duration-200 touch-manipulation"
                                    title="支払いを免除"
                                  >
                                    <X className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span className="hidden lg:inline ml-1 text-xs">免除</span>
                                  </Button>
                                )}

                              {/* 取り消しボタン（received/waivedステータス時のみ） */}
                              {isCashPayment &&
                                (simpleStatus === "paid" || simpleStatus === "waived") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      hasPaymentId(participant) &&
                                      openCancelDialog(participant.payment_id)
                                    }
                                    disabled={isUpdating}
                                    className="bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 min-h-[36px] min-w-[36px] px-2 sm:px-3 shadow-sm hover:shadow-md transition-all duration-200 touch-manipulation"
                                    title="決済を取り消し"
                                  >
                                    <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span className="hidden lg:inline ml-1 text-xs">取消</span>
                                  </Button>
                                )}

                              {/* URLコピーボタン */}
                              {/* 一時的に機能停止
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => _handleCopyGuestUrl(participant.attendance_id)}
                                disabled={participant.status !== "attending"}
                                className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 min-h-[36px] min-w-[36px] px-2 sm:px-3 shadow-sm hover:shadow-md transition-all duration-200 touch-manipulation"
                                title="URLをコピー"
                              >
                                <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                                <span className="hidden lg:inline ml-1 text-xs">URL</span>
                              </Button>
                              */}
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
                            {getAttendanceStatusBadgeWithIcon(participant.status)}
                            {getPaymentMethodBadge(participant.payment_method)}
                            {!isFreeEvent &&
                              participant.payment_status &&
                              (simpleStatus === "paid" ? (
                                <div className="flex items-center gap-1 text-green-600">
                                  <CheckCircle className="h-4 w-4" />
                                  <span className="text-sm font-medium">決済完了</span>
                                </div>
                              ) : (
                                <Badge
                                  variant={getSimplePaymentStatusStyle(simpleStatus).variant}
                                  className={getSimplePaymentStatusStyle(simpleStatus).className}
                                >
                                  {SIMPLE_PAYMENT_STATUS_LABELS[simpleStatus]}
                                </Badge>
                              ))}
                          </div>

                          {/* アクションボタン群 */}
                          <div className="flex flex-wrap gap-3 pt-2">
                            {/* 受領ボタン（現金決済で未完了時のみ） */}
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
                                  disabled={isUpdating}
                                  className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 min-h-[44px] touch-manipulation"
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  受領
                                </Button>
                              )}

                            {/* 免除ボタン（現金決済で未完了時のみ） */}
                            {isCashPayment &&
                              simpleStatus !== "paid" &&
                              simpleStatus !== "waived" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    hasPaymentId(participant) &&
                                    handleUpdatePaymentStatus(participant.payment_id, "waived")
                                  }
                                  disabled={isUpdating}
                                  className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100 min-h-[44px] touch-manipulation"
                                >
                                  <X className="h-4 w-4 mr-2" />
                                  免除
                                </Button>
                              )}

                            {/* 取り消しボタン（received/waivedステータス時のみ） */}
                            {isCashPayment &&
                              (simpleStatus === "paid" || simpleStatus === "waived") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    hasPaymentId(participant) &&
                                    openCancelDialog(participant.payment_id)
                                  }
                                  disabled={isUpdating}
                                  className="bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 min-h-[44px] touch-manipulation"
                                >
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  取り消し
                                </Button>
                              )}

                            {/* URLコピーボタン */}
                            {/* 一時的にコメントアウト
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => _handleCopyGuestUrl(participant.attendance_id)}
                              disabled={participant.status !== "attending"}
                              className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 min-h-[44px] touch-manipulation"
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              URL共有
                            </Button>
                            */}
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
        {(pagination.totalPages > 1 || pagination.total > 50) && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 py-3 sm:px-6 border-t">
            {/* 表示件数情報とページサイズ選択 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="text-sm text-gray-700">
                {pagination.total}件中 {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}件を表示
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">表示件数:</span>
                <Select value={currentLimit.toString()} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="w-20 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ページネーションボタン（ページが複数ある場合のみ表示） */}
            {pagination.totalPages > 1 && (
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
            )}
          </div>
        )}
      </CardContent>

      {/* 取り消し確認ダイアログ */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>決済取り消しの確認</DialogTitle>
            <DialogDescription>
              この決済ステータスを「未決済」に戻します。この操作は実行後でも再度変更可能です。
              <br />
              <strong>取り消しますか？</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelingPaymentId(null);
              }}
              disabled={isUpdating}
            >
              キャンセル
            </Button>
            <Button
              onClick={() => cancelingPaymentId && handleCancelPaymentStatus(cancelingPaymentId)}
              disabled={isUpdating}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isUpdating ? "処理中..." : "取り消す"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
