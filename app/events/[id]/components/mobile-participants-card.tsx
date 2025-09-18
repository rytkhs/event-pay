"use client";

import React from "react";

import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { Check, X, Copy, Users, CreditCard, Banknote } from "lucide-react";

// import { useToast } from "@core/contexts/toast-context";
import { hasPaymentId } from "@core/utils/data-guards";
import type { GetParticipantsResponse } from "@core/validation/participant-management";

import { PaymentStatusBadge } from "@components/ui/payment-status-badge";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

interface MobileParticipantsCardProps {
  participants: GetParticipantsResponse["participants"];
  selectedPaymentIds: string[];
  isUpdatingStatus: boolean;
  onSelectPayment: (paymentId: string, checked: boolean) => void;
  onUpdatePaymentStatus: (paymentId: string, status: "received" | "waived") => void;
  onCopyGuestUrl: (attendanceId: string) => void;
}

export function MobileParticipantsCard({
  participants,
  selectedPaymentIds,
  isUpdatingStatus,
  onSelectPayment,
  onUpdatePaymentStatus,
  onCopyGuestUrl,
}: MobileParticipantsCardProps) {
  // const { toast } = useToast();

  // 日付フォーマット
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(parseISO(dateString), "MM/dd HH:mm", { locale: ja });
    } catch {
      return "-";
    }
  };

  // 金額フォーマット
  const formatAmount = (amount: number | null) => {
    if (amount === null) return "-";
    return `¥${amount.toLocaleString()}`;
  };

  // ステータスバッジ
  const getAttendanceStatusBadge = (status: string) => {
    switch (status) {
      case "attending":
        return (
          <Badge variant="default" className="bg-blue-100 text-blue-800 text-xs">
            参加予定
          </Badge>
        );
      case "not_attending":
        return (
          <Badge variant="secondary" className="bg-red-100 text-red-800 text-xs">
            不参加
          </Badge>
        );
      case "maybe":
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 text-xs">
            未定
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {status}
          </Badge>
        );
    }
  };

  const getPaymentMethodIcon = (method: string | null) => {
    if (!method) return null;
    switch (method) {
      case "stripe":
        return <CreditCard className="h-4 w-4 text-purple-600" />;
      case "cash":
        return <Banknote className="h-4 w-4 text-orange-600" />;
      default:
        return null;
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
          const isUnpaid =
            participant.payment_status === "pending" ||
            participant.payment_status === "failed" ||
            participant.payment_status === "refunded";

          const isCashPayment = participant.payment_method === "cash" && participant.payment_id;
          const isSelected = participant.payment_id
            ? selectedPaymentIds.includes(participant.payment_id)
            : false;

          return (
            <Card
              key={participant.attendance_id}
              className={`${isUnpaid ? "border-l-4 border-l-red-400 bg-red-50" : ""} hover:shadow-md transition-shadow`}
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
                      <p className="text-sm text-gray-500 truncate">{participant.email}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {getAttendanceStatusBadge(participant.status)}
                  </div>
                </div>

                {/* 決済情報行 */}
                <div className="grid grid-cols-2 gap-4 py-2 bg-gray-50 rounded-lg px-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getPaymentMethodIcon(participant.payment_method)}
                      <span className="text-sm text-gray-600">
                        {participant.payment_method === "stripe"
                          ? "カード"
                          : participant.payment_method === "cash"
                            ? "現金"
                            : "-"}
                      </span>
                    </div>
                    <div className="text-sm font-medium">
                      <PaymentStatusBadge status={participant.payment_status} />
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <p
                      className={`text-sm font-medium ${isUnpaid ? "text-red-600" : "text-gray-900"}`}
                    >
                      {formatAmount(participant.amount)}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(participant.paid_at)}</p>
                  </div>
                </div>

                {/* アクション行 */}
                <div className="flex items-center gap-2 pt-2">
                  {isCashPayment &&
                    participant.payment_status !== "received" &&
                    participant.payment_status !== "waived" && (
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
