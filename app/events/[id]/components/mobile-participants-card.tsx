"use client";

import React from "react";

import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { Check, X, Copy, Users } from "lucide-react";

// import { useToast } from "@core/contexts/toast-context";
import { hasPaymentId } from "@core/utils/data-guards";
import { toSimplePaymentStatus, isPaymentCompleted } from "@core/utils/payment-status-mapper";
import type { GetParticipantsResponse } from "@core/validation/participant-management";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

import {
  AttendanceStatusPill,
  PaymentMethodIcon,
  PaymentStatusIndicator,
} from "./status-indicators";

interface MobileParticipantsCardProps {
  eventFee: number;
  participants: GetParticipantsResponse["participants"];
  selectedPaymentIds: string[];
  isUpdatingStatus: boolean;
  onSelectPayment: (paymentId: string, checked: boolean) => void;
  onUpdatePaymentStatus: (paymentId: string, status: "received" | "waived") => void;
  onCopyGuestUrl: (attendanceId: string) => void;
}

export function MobileParticipantsCard({
  eventFee,
  participants,
  selectedPaymentIds,
  isUpdatingStatus,
  onSelectPayment,
  onUpdatePaymentStatus,
  onCopyGuestUrl,
}: MobileParticipantsCardProps) {
  // const { toast } = useToast();

  // 無料イベントかどうかの判定
  const isFreeEvent = eventFee === 0;

  // 日付フォーマット
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(parseISO(dateString), "MM/dd HH:mm", { locale: ja });
    } catch {
      return "-";
    }
  };

  return (
    <div className="space-y-3">
      {participants.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <Users className="h-12 w-12 text-gray-300 mx-auto" />
              <p className="text-gray-500">参加者が見つかりません</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        participants.map((participant) => {
          const isPaid = !isFreeEvent && isPaymentCompleted(participant.payment_status);
          const simpleStatus = toSimplePaymentStatus(participant.payment_status);

          const isCashPayment = participant.payment_method === "cash" && participant.payment_id;
          const isSelected = participant.payment_id
            ? selectedPaymentIds.includes(participant.payment_id)
            : false;

          return (
            <Card
              key={participant.attendance_id}
              className={`${isPaid ? "border-l-4 !border-l-green-400 bg-green-50" : ""}`}
            >
              <CardContent className="p-4 space-y-3">
                {/* ヘッダー行 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isCashPayment && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked: boolean) =>
                          hasPaymentId(participant) &&
                          onSelectPayment(participant.payment_id, checked)
                        }
                        disabled={isUpdatingStatus}
                        className="flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-gray-900 truncate">{participant.nickname}</h3>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <AttendanceStatusPill status={participant.status} size="sm" />
                  </div>
                </div>

                {/* 決済情報行 - 無料イベントでは非表示 */}
                {!isFreeEvent && (
                  <div className="grid grid-cols-2 gap-4 py-2 bg-gray-50 rounded-lg px-3">
                    <div className="space-y-2">
                      <PaymentMethodIcon method={participant.payment_method} size="sm" />
                      <PaymentStatusIndicator
                        status={participant.payment_status || "pending"}
                        amount={participant.amount}
                        size="sm"
                      />
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-xs text-gray-500">{formatDate(participant.paid_at)}</p>
                    </div>
                  </div>
                )}

                {/* アクション行 */}
                <div className="flex items-center gap-2 pt-2">
                  {isCashPayment && simpleStatus !== "paid" && simpleStatus !== "waived" && (
                    <div className="flex gap-2 flex-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          hasPaymentId(participant) &&
                          onUpdatePaymentStatus(participant.payment_id, "received")
                        }
                        disabled={isUpdatingStatus}
                        className="flex-1 h-8 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        受領済み
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          hasPaymentId(participant) &&
                          onUpdatePaymentStatus(participant.payment_id, "waived")
                        }
                        disabled={isUpdatingStatus}
                        className="flex-1 h-8 text-xs bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                      >
                        <X className="h-3 w-3 mr-1" />
                        免除
                      </Button>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onCopyGuestUrl(participant.attendance_id)}
                    className="h-8 px-3 text-xs"
                    disabled={participant.status !== "attending"}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    URL
                  </Button>
                </div>

                {/* 更新日時 */}
                <div className="text-xs text-gray-400 pt-1 border-t border-gray-100">
                  最終更新: {formatDate(participant.attendance_updated_at)}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
