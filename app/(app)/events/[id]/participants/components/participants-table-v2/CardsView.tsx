"use client";

import React from "react";

import { Banknote, Check, CreditCard, MoreHorizontal, RotateCcw } from "lucide-react";

import {
  hasPaymentId,
  isPaymentUnpaid,
  toSimplePaymentStatus,
} from "@core/utils/payment-status-mapper";
import type { ParticipantView } from "@core/validation/participant-management";

import { SIMPLE_PAYMENT_STATUS_LABELS, getSimplePaymentStatusStyle } from "@features/events";

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

  // ステータスバッジの取得（無料イベントでは「参加」も表示）
  const getStatusBadge = (status: string) => {
    if (status === "attending") {
      if (!isFreeEvent) return null; // 有料イベントは決済情報でわかるので省略
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100 shadow-none font-medium px-1.5 py-0.5 text-xs h-5">
          参加
        </Badge>
      );
    }
    const label = status === "not_attending" ? "不参加" : "未定";
    const className =
      status === "not_attending"
        ? "bg-red-100 text-red-800 border-red-200 hover:bg-red-100"
        : "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100";
    return (
      <Badge className={`${className} shadow-none font-medium px-1.5 py-0.5 text-xs h-5`}>
        {label}
      </Badge>
    );
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
      className="flex flex-col border rounded-md divide-y divide-border bg-white"
      role="grid"
      aria-label="参加者一覧"
    >
      {participants.map((p) => {
        const isActionRequired =
          !isFreeEvent && p.status === "attending" && isPaymentUnpaid(p.payment_status);
        const simple = toSimplePaymentStatus(p.payment_status);
        const isCanceledPayment = p.payment_status === "canceled";
        const isCashPayment = p.payment_method === "cash" && p.payment_id && !isCanceledPayment;
        const isOperatable =
          p.status === "attending" &&
          isCashPayment &&
          (p.payment_status === "pending" || p.payment_status === "failed");
        const canCancel =
          p.status === "attending" && isCashPayment && (simple === "paid" || simple === "waived");
        const isSelected = bulkSelection?.selectedPaymentIds.includes(p.payment_id || "") || false;

        // 選択モード中の挙動：
        // bulkSelectionが存在する = 選択モードON
        // ただし、チェックボックスを表示するのは isOperatable な項目のみ
        const isSelectionMode = !!bulkSelection;
        const showCheckbox = isSelectionMode && isOperatable && p.payment_id;

        return (
          <div
            key={p.attendance_id}
            className={`
              relative flex items-start gap-3 py-3 px-4
              transition-all duration-200
              ${isActionRequired ? "bg-red-50/30" : "bg-white"}
              hover:bg-gray-50
            `}
            role="gridcell"
          >
            {/* Action Required Indicator (Left Border) */}
            {isActionRequired && (
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-sm" />
            )}

            {/* Selection Checkbox (Slide-in effect logic handled by parent state presence) */}
            {isSelectionMode && (
              <div className="flex items-center self-center h-full mr-1">
                {showCheckbox ? (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      const paymentId = p.payment_id;
                      if (paymentId) {
                        bulkSelection.onSelect(paymentId, checked === true);
                      }
                    }}
                    disabled={bulkSelection.isDisabled}
                    aria-label="選択"
                    className="h-5 w-5"
                  />
                ) : (
                  <div className="w-5 h-5" /> /* Placeholder alignment */
                )}
              </div>
            )}

            {/* Main Content Grid */}
            <div className="flex-1 min-w-0 grid gap-1.5">
              {/* Row 1: Name & Status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-gray-900 truncate">{p.nickname}</span>
                  {getStatusBadge(p.status)}
                </div>
              </div>

              {/* Row 2: Payment Status & Actions */}
              {!isFreeEvent && (
                <div className="flex items-center justify-between gap-2 min-h-10">
                  {/* Status Badge */}
                  <div className="flex items-center gap-1.5">
                    {p.status === "attending" && !isCanceledPayment ? (
                      <>
                        {getPaymentMethodIcon(p.payment_method)}
                        {p.payment_status && (
                          <Badge
                            variant={getSimplePaymentStatusStyle(simple).variant}
                            className={`${getSimplePaymentStatusStyle(simple).className} text-xs px-1.5 py-0 h-5 font-normal`}
                          >
                            {SIMPLE_PAYMENT_STATUS_LABELS[simple]}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </div>

                  {/* Primary Action Button (Right aligned) */}
                  <div className="flex items-center gap-1">
                    {isOperatable && !isSelectionMode && (
                      <Button
                        // size="sm"
                        variant="outline"
                        onClick={() => hasPaymentId(p) && onReceive(p.payment_id)}
                        disabled={!!isUpdating}
                        className="h-9 px-2 py-3 text-sm font-medium border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 hover:text-green-800 shadow-sm"
                      >
                        <Check className="h-5 w-5 mr-0" />
                        受領
                      </Button>
                    )}

                    {/* Secondary Menu */}
                    {canCancel && !isSelectionMode && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground"
                            disabled={!!isUpdating}
                          >
                            <MoreHorizontal className="h-4 w-4" />
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
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
