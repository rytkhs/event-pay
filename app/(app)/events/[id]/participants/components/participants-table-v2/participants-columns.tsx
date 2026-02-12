"use client";

import React from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Check, CreditCard, RotateCcw } from "lucide-react";

import { hasPaymentId, toSimplePaymentStatus } from "@core/utils/payment-status-mapper";
import type { ParticipantView } from "@core/validation/participant-management";

import { SIMPLE_PAYMENT_STATUS_LABELS, getSimplePaymentStatusStyle } from "@features/events";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface ActionsCellHandlers {
  onReceive: (paymentId: string) => void;
  onCancel: (paymentId: string) => void;
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
  bulkSelection?: BulkSelectionConfig;
}): ColumnDef<ParticipantView>[] {
  const isFreeEvent = opts.eventFee === 0;
  const { bulkSelection } = opts;

  const columns: ColumnDef<ParticipantView>[] = [];

  // チェックボックス列（一括選択有効時のみ）
  if (bulkSelection) {
    columns.push({
      id: "select",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        const isCashPayment = p.payment_method === "cash" && p.payment_id;
        const isOperatable =
          p.status === "attending" &&
          isCashPayment &&
          (p.payment_status === "pending" || p.payment_status === "failed");

        if (!isOperatable) {
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
        return <span className="font-medium text-gray-900">{p.nickname}</span>;
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
            ? "bg-green-100 text-green-800 border-green-200"
            : p.status === "not_attending"
              ? "bg-red-100 text-red-800 border-red-200"
              : "bg-yellow-100 text-yellow-800 border-yellow-300";
        return <Badge className={`${className} font-medium px-3 py-1 shadow-sm`}>{label}</Badge>;
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
          if (!showMethod) return <span className="text-gray-400 text-sm">-</span>;

          const method = row.original.payment_method;
          if (!method) return <span className="text-gray-400 text-sm">-</span>;
          const isStripe = method === "stripe";
          const className = isStripe
            ? "bg-purple-100 text-purple-800 border-purple-200"
            : "bg-orange-100 text-orange-800 border-orange-200";
          const Icon = isStripe ? CreditCard : Banknote;
          return (
            <Badge
              className={`${className} font-medium px-3 py-1 shadow-sm flex items-center gap-1.5 w-fit`}
            >
              <Icon className="h-3.5 w-3.5" />
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
            return <span className="text-gray-400 text-xs sm:text-sm">-</span>;
          const simple = toSimplePaymentStatus(status);
          if (simple === "paid") {
            const s = getSimplePaymentStatusStyle(simple);
            return (
              <Badge
                variant={s.variant}
                className={`${s.className} font-medium px-3 py-1 shadow-sm`}
              >
                {SIMPLE_PAYMENT_STATUS_LABELS[simple]}
              </Badge>
            );
          }
          const s = getSimplePaymentStatusStyle(simple);
          return (
            <Badge variant={s.variant} className={`${s.className} font-medium px-3 py-1 shadow-sm`}>
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
          const simple = toSimplePaymentStatus(p.payment_status);
          const isCashPayment = p.payment_method === "cash" && p.payment_id;
          const { onReceive, onCancel, isUpdating } = opts.handlers;
          const canOperateCash =
            p.status === "attending" &&
            isCashPayment &&
            (p.payment_status === "pending" || p.payment_status === "failed");

          return (
            <div className="flex items-center gap-2">
              {canOperateCash && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => hasPaymentId(p) && onReceive(p.payment_id)}
                  disabled={!!isUpdating}
                  className="border-green-200 bg-green-50/50 text-green-700 hover:bg-green-100 hover:border-green-300 hover:text-green-800 min-h-[36px] min-w-[36px] px-2 sm:px-3 shadow-sm hover:shadow-md transition-all duration-200"
                  title="受領済みにする"
                >
                  <Check className="h-4 w-4" />
                  受領
                </Button>
              )}
              {p.status === "attending" &&
                isCashPayment &&
                (simple === "paid" || simple === "waived") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => hasPaymentId(p) && onCancel(p.payment_id)}
                    disabled={!!isUpdating}
                    className="border-gray-200 bg-gray-50/50 text-gray-700 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-900 min-h-[36px] min-w-[36px] px-2 sm:px-3 shadow-sm hover:shadow-md transition-all duration-200"
                    title="受領を取り消し"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
            </div>
          );
        },
        enableSorting: false,
      }
    );
  }

  return columns;
}
