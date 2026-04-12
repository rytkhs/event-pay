"use client";

import React from "react";

import { Banknote, Check, CreditCard, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";

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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { canShowDeleteMistakenAttendanceAction } from "./participant-action-visibility";

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
  onDeleteMistaken: (participant: ParticipantView) => void;
  isSelectionMode?: boolean;
  bulkSelection?: BulkSelectionConfig;
}

export function CardsView({
  participants,
  eventFee,
  isUpdating,
  onReceive,
  onCancel,
  onDeleteMistaken,
  isSelectionMode: isSelectionModeProp = false,
  bulkSelection,
}: CardsViewProps) {
  const isFreeEvent = eventFee === 0;

  // ステータスバッジの取得（無料イベントでは「参加」も表示）
  const getStatusBadge = (status: string) => {
    if (status === "attending") {
      if (!isFreeEvent) return null; // 有料イベントは決済情報でわかるので省略
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border-transparent shadow-none font-semibold px-2 py-0.5 text-[11px] rounded-full h-5">
          参加
        </Badge>
      );
    }
    const label = status === "not_attending" ? "不参加" : "未定";
    const className =
      status === "not_attending"
        ? "bg-rose-500/10 text-rose-600 border-transparent"
        : "bg-amber-500/10 text-amber-600 border-transparent";
    return (
      <Badge
        className={`${className} shadow-none font-semibold px-2 py-0.5 text-[11px] rounded-full h-5`}
      >
        {label}
      </Badge>
    );
  };

  // 決済方法アイコン
  const getPaymentMethodIcon = (method: string | null) => {
    if (!method) return null;
    return method === "stripe" ? (
      <CreditCard className="h-3.5 w-3.5 text-violet-500" aria-label="オンライン決済" />
    ) : (
      <Banknote className="h-3.5 w-3.5 text-orange-500" aria-label="現金" />
    );
  };

  return (
    <div className="flex flex-col gap-3 py-1" role="grid" aria-label="参加者一覧">
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
        const canDeleteMistaken = canShowDeleteMistakenAttendanceAction(p);
        const isBulkSelectionMode = !!bulkSelection;
        const isSelectionMode = isSelectionModeProp || isBulkSelectionMode;
        const showSecondaryMenu = !isSelectionMode && (canCancel || canDeleteMistaken);
        const isSelected = bulkSelection?.selectedPaymentIds.includes(p.payment_id || "") || false;
        const showCheckbox = isBulkSelectionMode && isOperatable && p.payment_id;

        return (
          <div
            key={p.attendance_id}
            className={`
              relative flex items-start gap-3 py-3.5 px-4
              transition-all duration-200
              rounded-2xl border
              ${
                isActionRequired
                  ? "bg-rose-50/40 border-rose-200/80 shadow-[0_2px_10px_-4px_rgba(225,29,72,0.1)]"
                  : "bg-white/70 backdrop-blur-sm border-border/60 shadow-[0_1px_3px_hsl(var(--foreground)/0.03)]"
              }
            `}
            role="gridcell"
          >
            {/* Action Required Indicator */}
            {isActionRequired && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-[65%] bg-rose-400 rounded-r-md opacity-80" />
            )}

            {/* Selection Checkbox */}
            {isBulkSelectionMode && (
              <div className="flex items-center self-center h-full mr-0.5">
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
                    className="h-5 w-5 rounded-md border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-colors"
                  />
                ) : (
                  <div className="w-5 h-5" />
                )}
              </div>
            )}

            {/* Main Content Grid */}
            <div className="flex-1 min-w-0 grid gap-2">
              {/* Row 1: Name & Status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[14px] font-semibold text-foreground/90 truncate tracking-tight">
                    {p.nickname}
                  </span>
                  {getStatusBadge(p.status)}
                </div>
                {isFreeEvent && showSecondaryMenu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 rounded-xl p-0 text-muted-foreground hover:bg-muted/60 transition-colors"
                        disabled={!!isUpdating}
                        aria-label={`${p.nickname}の操作メニューを開く`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="rounded-xl shadow-xl border-border/60 min-w-[8rem] p-1.5"
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => onDeleteMistaken(p)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive text-[13px] rounded-lg cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          参加者を削除
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Row 2: Payment Status & Actions */}
              {!isFreeEvent && (
                <div className="flex items-center justify-between gap-2 min-h-[2.25rem]">
                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    {p.status === "attending" && !isCanceledPayment ? (
                      <>
                        {getPaymentMethodIcon(p.payment_method) && (
                          <div className="flex items-center justify-center bg-muted/40 w-[1.375rem] h-[1.375rem] rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                            {getPaymentMethodIcon(p.payment_method)}
                          </div>
                        )}
                        {p.payment_status && (
                          <Badge
                            variant={getSimplePaymentStatusStyle(simple).variant}
                            className={`${getSimplePaymentStatusStyle(simple).className} rounded-full text-[11px] px-2.5 py-0.5 h-6 font-medium shadow-sm border-transparent tracking-wide`}
                          >
                            {SIMPLE_PAYMENT_STATUS_LABELS[simple]}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground/45">-</span>
                    )}
                  </div>

                  {/* Primary Action Button (Right aligned) */}
                  <div className="flex items-center gap-1.5">
                    {isOperatable && !isSelectionMode && (
                      <Button
                        variant="outline"
                        onClick={() => hasPaymentId(p) && onReceive(p.payment_id)}
                        disabled={!!isUpdating}
                        className="h-8 px-3.5 text-[12px] font-semibold rounded-xl border-emerald-200/80 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 hover:border-emerald-300 hover:text-emerald-800 shadow-sm transition-all"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" strokeWidth={2.5} />
                        受領
                      </Button>
                    )}

                    {/* Secondary Menu */}
                    {showSecondaryMenu && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:bg-muted/60 transition-colors"
                            disabled={!!isUpdating}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="rounded-xl shadow-xl border-border/60 min-w-[8rem] p-1.5"
                        >
                          <DropdownMenuGroup>
                            {canCancel && (
                              <DropdownMenuItem
                                onClick={() => hasPaymentId(p) && onCancel(p.payment_id)}
                                className="text-foreground/80 focus:bg-muted/60 focus:text-foreground text-[13px] rounded-lg cursor-pointer"
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                                受領を取り消し
                              </DropdownMenuItem>
                            )}
                            {canDeleteMistaken && (
                              <DropdownMenuItem
                                onClick={() => onDeleteMistaken(p)}
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive text-[13px] rounded-lg cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                参加者を削除
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuGroup>
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
