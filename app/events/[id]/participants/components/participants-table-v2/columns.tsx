"use client";

import React from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { Check, RotateCcw, Shield } from "lucide-react";

import { hasPaymentId } from "@core/utils/data-guards";
import {
  SIMPLE_PAYMENT_STATUS_LABELS,
  getSimplePaymentStatusStyle,
  toSimplePaymentStatus,
} from "@core/utils/payment-status-mapper";
import type { ParticipantView } from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ActionsCellHandlers {
  onReceive: (paymentId: string) => void;
  onWaive: (paymentId: string) => void;
  onCancel: (paymentId: string) => void;
  isUpdating?: boolean;
}

export function buildParticipantsColumns(opts: {
  eventFee: number;
  handlers: ActionsCellHandlers;
}): ColumnDef<ParticipantView>[] {
  const isFreeEvent = opts.eventFee === 0;

  return [
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
    },
    {
      accessorKey: "payment_method",
      header: "決済方法",
      cell: ({ row }) => {
        const method = row.original.payment_method;
        if (!method) return <span className="text-gray-400 text-sm">-</span>;
        const isStripe = method === "stripe";
        const className = isStripe
          ? "bg-purple-100 text-purple-800 border-purple-200"
          : "bg-orange-100 text-orange-800 border-orange-200";
        return (
          <Badge className={`${className} font-medium px-3 py-1 shadow-sm`}>
            {isStripe ? "オンライン決済" : "現金"}
          </Badge>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "payment_status",
      header: "決済状況",
      cell: ({ row }) => {
        const status = row.original.payment_status;
        if (isFreeEvent || !status)
          return <span className="text-gray-400 text-xs sm:text-sm">-</span>;
        const simple = toSimplePaymentStatus(status as any);
        if (simple === "paid") {
          const s = getSimplePaymentStatusStyle(simple);
          return (
            <Badge variant={s.variant} className={`${s.className} font-medium px-3 py-1 shadow-sm`}>
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
        const simple = toSimplePaymentStatus(p.payment_status as any);
        const isCashPayment = p.payment_method === "cash" && p.payment_id;
        const { onReceive, onWaive, onCancel, isUpdating } = opts.handlers;

        return (
          <div className="flex items-center gap-2">
            {isCashPayment && simple !== "paid" && simple !== "waived" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => hasPaymentId(p) && onReceive(p.payment_id)}
                disabled={!!isUpdating}
                className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 min-h-[36px] min-w-[36px] px-2 sm:px-3 shadow-sm hover:shadow-md"
                title="受領済みにする"
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            {isCashPayment && simple !== "paid" && simple !== "waived" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => hasPaymentId(p) && onWaive(p.payment_id)}
                disabled={!!isUpdating}
                className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100 min-h-[36px] min-w-[36px] px-2 sm:px-3 shadow-sm hover:shadow-md"
                title="支払いを免除"
              >
                <Shield className="h-4 w-4" />
              </Button>
            )}
            {isCashPayment && (simple === "paid" || simple === "waived") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => hasPaymentId(p) && onCancel(p.payment_id)}
                disabled={!!isUpdating}
                className="bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 min-h-[36px] min-w-[36px] px-2 sm:px-3 shadow-sm hover:shadow-md"
                title="決済を取り消し"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
      enableSorting: false,
    },
  ];
}
