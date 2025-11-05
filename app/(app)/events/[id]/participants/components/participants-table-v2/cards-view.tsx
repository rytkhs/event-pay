"use client";

import React from "react";

import { Check, RotateCcw, Shield } from "lucide-react";

import { hasPaymentId } from "@core/utils/data-guards";
import {
  isPaymentCompleted,
  getSimplePaymentStatusStyle,
  toSimplePaymentStatus,
  SIMPLE_PAYMENT_STATUS_LABELS,
} from "@core/utils/payment-status-mapper";
import type { ParticipantView } from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

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
  onWaive: (paymentId: string) => void;
  onCancel: (paymentId: string) => void;
  bulkSelection?: BulkSelectionConfig;
}

export function CardsView({
  participants,
  eventFee,
  isUpdating,
  onReceive,
  onWaive,
  onCancel,
  bulkSelection,
}: CardsViewProps) {
  const isFreeEvent = eventFee === 0;

  const getAttendanceBadge = (status: string) => {
    const label = status === "attending" ? "参加" : status === "not_attending" ? "不参加" : "未定";
    const className =
      status === "attending"
        ? "bg-green-100 text-green-800 border-green-200"
        : status === "not_attending"
          ? "bg-red-100 text-red-800 border-red-200"
          : "bg-yellow-100 text-yellow-800 border-yellow-300";
    return <Badge className={`${className} font-medium px-3 py-1 shadow-sm`}>{label}</Badge>;
  };

  const getPaymentMethodBadge = (method: string | null) => {
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
  };

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      role="grid"
      aria-label="参加者一覧"
    >
      {participants.map((p) => {
        const isPaid = !isFreeEvent && isPaymentCompleted(p.payment_status);
        const simple = toSimplePaymentStatus(p.payment_status as any);
        const isCanceledPayment = p.payment_status === "canceled";
        const isCashPayment = p.payment_method === "cash" && p.payment_id && !isCanceledPayment;
        const isOperatable =
          p.status === "attending" &&
          isCashPayment &&
          (p.payment_status === "pending" || p.payment_status === "failed");
        const isSelected = bulkSelection?.selectedPaymentIds.includes(p.payment_id || "") || false;

        return (
          <Card
            key={p.attendance_id}
            className={`${isPaid ? "border-green-200 bg-green-50" : ""} transition-all duration-200`}
            role="gridcell"
            tabIndex={0}
            aria-label={`参加者: ${p.nickname}`}
          >
            <CardContent className="p-4 sm:p-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {bulkSelection && isOperatable && p.payment_id && (
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
                      />
                    )}
                    <h4 className="font-semibold text-gray-900 text-lg">{p.nickname}</h4>
                  </div>
                  {isPaid && (
                    <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
                      完了
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {getAttendanceBadge(p.status)}
                  {p.status !== "attending" || isCanceledPayment ? (
                    <span className="text-gray-400 text-sm">-</span>
                  ) : (
                    <>
                      {getPaymentMethodBadge(p.payment_method)}
                      {!isFreeEvent && p.payment_status && p.status === "attending" && (
                        <Badge
                          variant={getSimplePaymentStatusStyle(simple).variant}
                          className={`${getSimplePaymentStatusStyle(simple).className} font-medium px-3 py-1 shadow-sm`}
                        >
                          {SIMPLE_PAYMENT_STATUS_LABELS[simple]}
                        </Badge>
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  {isOperatable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => hasPaymentId(p) && onReceive(p.payment_id)}
                      disabled={!!isUpdating}
                      className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 min-h-[44px]"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      受領
                    </Button>
                  )}
                  {isOperatable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => hasPaymentId(p) && onWaive(p.payment_id)}
                      disabled={!!isUpdating}
                      className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100 min-h-[44px]"
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      免除
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
                        className="bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 min-h-[44px]"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        取り消し
                      </Button>
                    )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
