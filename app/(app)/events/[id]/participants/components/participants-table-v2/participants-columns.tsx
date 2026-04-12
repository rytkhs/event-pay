"use client";

import React from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Check, CreditCard } from "lucide-react";

import { hasPaymentId, toSimplePaymentStatus } from "@core/utils/payment-status-mapper";
import type { ParticipantView } from "@core/validation/participant-management";

import { SIMPLE_PAYMENT_STATUS_LABELS, getSimplePaymentStatusStyle } from "@features/events";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/core/utils";

import { getParticipantActionState } from "./participant-action-visibility";
import { ParticipantActionMenu } from "./ParticipantActionMenu";

export interface ActionsCellHandlers {
  onReceive: (paymentId: string) => void;
  onCancel: (paymentId: string) => void;
  onDeleteMistaken: (participant: ParticipantView) => void;
  isUpdating?: boolean;
}

export interface BulkSelectionConfig {
  selectedPaymentIds: string[];
  onSelect: (paymentId: string, checked: boolean) => void;
  isDisabled?: boolean;
}

export function buildParticipantsColumns(opts: {
  eventFee: number;
  handlers: ActionsCellHandlers;
  isSelectionMode?: boolean;
  bulkSelection?: BulkSelectionConfig;
}): ColumnDef<ParticipantView>[] {
  const isFreeEvent = opts.eventFee === 0;
  const { bulkSelection, isSelectionMode = false } = opts;

  const columns: ColumnDef<ParticipantView>[] = [];

  // チェックボックス列（一括選択有効時のみ）
  if (bulkSelection) {
    columns.push({
      id: "select",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        const { canReceiveCash } = getParticipantActionState(p);

        if (!canReceiveCash) {
          return <div className="w-4" />; // 空の領域を確保
        }

        if (!p.payment_id) return <div className="w-4" />;

        const paymentId = p.payment_id;
        const isSelected = bulkSelection.selectedPaymentIds.includes(paymentId);
        return (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => bulkSelection.onSelect(paymentId, checked === true)}
            disabled={bulkSelection.isDisabled}
            aria-label="選択"
          />
        );
      },
      enableSorting: false,
    });
  }

  columns.push(
    {
      accessorKey: "nickname",
      header: "ニックネーム",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <span className="font-semibold text-foreground text-sm leading-none">{p.nickname}</span>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "status",
      header: "参加状況",
      cell: ({ row }) => {
        const p = row.original;
        const label =
          p.status === "attending" ? "参加" : p.status === "not_attending" ? "不参加" : "未定";
        const className =
          p.status === "attending"
            ? "text-emerald-700 border-emerald-500/20 bg-emerald-500/10 shadow-[0_2px_8px_-4px_rgba(16,185,129,0.2)]"
            : p.status === "not_attending"
              ? "text-rose-700 border-rose-500/20 bg-rose-500/10 shadow-[0_2px_8px_-4px_rgba(244,63,94,0.2)]"
              : "text-amber-700 border-amber-500/30 bg-amber-500/10 shadow-[0_2px_8px_-4px_rgba(245,158,11,0.2)]";
        return (
          <Badge
            variant="outline"
            className={cn(
              "px-2 py-0.5 font-semibold tracking-[0.05em] text-[12px] leading-tight rounded-[6px] border shadow-none shrink-0 whitespace-nowrap uppercase",
              className
            )}
          >
            {label}
          </Badge>
        );
      },
      enableSorting: true,
    }
  );

  if (!isFreeEvent) {
    columns.push(
      {
        accessorKey: "payment_method",
        header: "決済方法",
        cell: ({ row }) => {
          const p = row.original;
          const showMethod = p.status === "attending" && p.payment_status !== "canceled";
          if (!showMethod)
            return <span className="text-muted-foreground/40 text-[13px] font-medium">-</span>;

          const method = row.original.payment_method;
          if (!method)
            return <span className="text-muted-foreground/40 text-[13px] font-medium">-</span>;
          const isStripe = method === "stripe";
          const className = isStripe
            ? "text-indigo-700 border-indigo-500/20 bg-indigo-500/10"
            : "text-amber-700 border-amber-500/30 bg-amber-500/10";
          const Icon = isStripe ? CreditCard : Banknote;
          return (
            <Badge
              variant="outline"
              className={cn(
                "px-2 py-0.5 font-semibold tracking-[0.05em] text-[12px] leading-tight rounded-[6px] shadow-none flex items-center gap-1.5 w-fit border uppercase",
                className
              )}
            >
              <Icon className="h-3 w-3" />
              {isStripe ? "オンライン" : "現金"}
            </Badge>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "payment_status",
        header: "決済状況",
        cell: ({ row }) => {
          const p = row.original;
          const status = p.payment_status;
          const isCanceledPayment = status === "canceled";
          const isNotAttending = p.status !== "attending";
          if (isFreeEvent || !status || isCanceledPayment || isNotAttending)
            return <span className="text-muted-foreground/40 text-[12px] font-medium">-</span>;
          const simple = toSimplePaymentStatus(status);
          const s = getSimplePaymentStatusStyle(simple);
          return (
            <Badge
              variant="outline"
              className={cn(
                "px-2 py-0.5 font-semibold tracking-[0.05em] text-[12px] leading-tight rounded-[6px] border shadow-none uppercase",
                s.className
              )}
            >
              {SIMPLE_PAYMENT_STATUS_LABELS[simple]}
            </Badge>
          );
        },
        enableSorting: false,
      },
      {
        id: "actions",
        header: "アクション",
        cell: ({ row }) => {
          const p = row.original;
          const { onReceive, onCancel, onDeleteMistaken, isUpdating } = opts.handlers;
          const actionState = getParticipantActionState(p, { isSelectionMode });

          return (
            <div className="flex items-center gap-2">
              {actionState.canReceiveCash && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => hasPaymentId(p) && onReceive(p.payment_id)}
                  disabled={!!isUpdating}
                  aria-label={`${p.nickname}の現金決済を受領済みにする`}
                  className="rounded-xl border-emerald-500/30 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/15 hover:border-emerald-500/40 text-[12px] font-bold h-8 px-3 transition-all duration-200"
                  title="受領済みにする"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  受領
                </Button>
              )}
              {actionState.showSecondaryMenu && (
                <ParticipantActionMenu
                  participant={p}
                  canCancel={actionState.canCancelCashReceipt}
                  canDeleteMistaken={actionState.canDeleteMistakenAttendance}
                  isUpdating={isUpdating}
                  onCancel={onCancel}
                  onDeleteMistaken={onDeleteMistaken}
                  triggerSize="icon"
                  triggerClassName="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200"
                  triggerAriaLabel={`${p.nickname}の操作メニューを開く`}
                  contentClassName="min-w-[9rem]"
                  cancelItemClassName="cursor-pointer"
                  deleteItemClassName="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                  itemIconClassName="h-3.5 w-3.5"
                />
              )}
            </div>
          );
        },
        enableSorting: false,
      }
    );
  }

  if (isFreeEvent) {
    columns.push({
      id: "actions",
      header: "アクション",
      cell: ({ row }) => {
        const p = row.original;
        const { onCancel, onDeleteMistaken, isUpdating } = opts.handlers;
        const actionState = getParticipantActionState(p, { isSelectionMode });
        if (!actionState.showSecondaryMenu) {
          return <div className="h-8" />;
        }

        return (
          <ParticipantActionMenu
            participant={p}
            canCancel={false}
            canDeleteMistaken={actionState.canDeleteMistakenAttendance}
            isUpdating={isUpdating}
            onCancel={onCancel}
            onDeleteMistaken={onDeleteMistaken}
            triggerSize="icon"
            triggerClassName="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200"
            triggerAriaLabel={`${p.nickname}の操作メニューを開く`}
            contentClassName="min-w-[9rem]"
            cancelItemClassName="cursor-pointer"
            deleteItemClassName="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
            itemIconClassName="h-3.5 w-3.5"
          />
        );
      },
      enableSorting: false,
    });
  }

  return columns;
}
