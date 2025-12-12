"use client";

import React from "react";

import { Banknote, Check, CreditCard, MoreHorizontal, RotateCcw } from "lucide-react";

import { hasPaymentId } from "@core/utils/data-guards";
import {
  isPaymentUnpaid,
  getSimplePaymentStatusStyle,
  toSimplePaymentStatus,
  SIMPLE_PAYMENT_STATUS_LABELS,
} from "@core/utils/payment-status-mapper";
import type { ParticipantView } from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface BulkSelectionConfig {
  selectedPaymentIds: string[];
  onSelect: (paymentId: string, checked: boolean) => void;
  isDisabled?: boolean;
}

export interface CardsViewProps {
  participants: ParticipantView[];
  eventFee: number;
  isUpdating?: boolean;
  onReceive: (paymentId: string) => void;
  onCancel: (paymentId: string) => void;
  bulkSelection?: BulkSelectionConfig;
}

export function CardsView({
  participants,
  eventFee,
  isUpdating,
  onReceive,
  onCancel,
  bulkSelection,
}: CardsViewProps) {
  const isFreeEvent = eventFee === 0;

  // コンパクトな参加状況ラベル（参加は非表示、それ以外のみ表示）
  const getAttendanceLabel = (status: string) => {
    if (status === "attending") return null;
    return status === "not_attending" ? "不参加" : "未定";
  };

  // 決済方法アイコン
  const getPaymentMethodIcon = (method: string | null) => {
    if (!method) return null;
    return method === "stripe" ? (
      <CreditCard className="h-3.5 w-3.5 text-purple-600" aria-label="オンライン決済" />
    ) : (
      <Banknote className="h-3.5 w-3.5 text-orange-600" aria-label="現金" />
    );
  };

  return (
    <div
      className="flex flex-col border rounded-md divide-y divide-border"
      role="grid"
      aria-label="参加者一覧"
    >
      {participants.map((p) => {
        const isActionRequired =
          !isFreeEvent && p.status === "attending" && isPaymentUnpaid(p.payment_status);
        const simple = toSimplePaymentStatus(p.payment_status as any);
        const isCanceledPayment = p.payment_status === "canceled";
        const isCashPayment = p.payment_method === "cash" && p.payment_id && !isCanceledPayment;
        const isOperatable =
          p.status === "attending" &&
          isCashPayment &&
          (p.payment_status === "pending" || p.payment_status === "failed");
        const canCancel =
          p.status === "attending" && isCashPayment && (simple === "paid" || simple === "waived");
        const isSelected = bulkSelection?.selectedPaymentIds.includes(p.payment_id || "") || false;
        const showCheckbox = bulkSelection && isOperatable && p.payment_id;
        const attendanceLabel = getAttendanceLabel(p.status);

        return (
          <div
            key={p.attendance_id}
            className={`
              flex items-center gap-2 py-2.5 px-3 sm:py-3 sm:px-4
              transition-colors hover:bg-muted/40
              ${isActionRequired ? "bg-red-50/80 border-l-4 !border-l-red-500" : "bg-card border-l-4 !border-l-transparent"}
            `}
            role="gridcell"
            tabIndex={0}
            aria-label={`参加者: ${p.nickname}`}
          >
            {/* Left: Checkbox + Name */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {bulkSelection && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    const paymentId = p.payment_id;
                    if (paymentId) {
                      bulkSelection.onSelect(paymentId, checked === true);
                    }
                  }}
                  disabled={bulkSelection.isDisabled || !showCheckbox}
                  aria-label="選択"
                  className={`shrink-0 ${showCheckbox ? "" : "invisible"}`}
                />
              )}
              <span className="font-medium text-gray-900 truncate text-sm sm:text-base">
                {p.nickname}
              </span>
              {/* 参加以外の場合のみステータス表示 */}
              {attendanceLabel && (
                <span className="text-xs text-gray-500 shrink-0">({attendanceLabel})</span>
              )}
            </div>

            {/* Center: Payment Info (Compact) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {p.status === "attending" && !isCanceledPayment ? (
                <>
                  {/* 決済方法アイコン */}
                  {getPaymentMethodIcon(p.payment_method)}

                  {/* 決済状況 */}
                  {!isFreeEvent && p.payment_status && (
                    <Badge
                      variant={getSimplePaymentStatusStyle(simple).variant}
                      className={`${getSimplePaymentStatusStyle(simple).className} text-xs px-1.5 py-0`}
                    >
                      {SIMPLE_PAYMENT_STATUS_LABELS[simple]}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-xs text-gray-400">-</span>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1 shrink-0 justify-end min-w-[2rem] sm:min-w-[5rem]">
              {/* 受領ボタン（メインアクション） */}
              {isOperatable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => hasPaymentId(p) && onReceive(p.payment_id)}
                  disabled={!!isUpdating}
                  className="h-8 px-2 bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span className="ml-1 text-xs hidden sm:inline">受領</span>
                </Button>
              )}

              {/* 取り消しなどの副次アクション（ドロップダウン） */}
              {canCancel && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      disabled={!!isUpdating}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">メニューを開く</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => hasPaymentId(p) && onCancel(p.payment_id)}
                      className="text-gray-700"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      受領を取り消し
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
