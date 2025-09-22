"use client";

import React from "react";

import { Users, CreditCard, Banknote, AlertTriangle, CheckCircle } from "lucide-react";

import type { ParticipantView } from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SmartBatchSelectionProps {
  participants: ParticipantView[];
  selectedPaymentIds: string[];
  onSelectionChange: (paymentIds: string[]) => void;
  isFreeEvent: boolean;
  isUpdating: boolean;
}

// スマート選択のヘルパー関数
function getSmartSelectionCounts(participants: ParticipantView[]) {
  const stats = {
    total: participants.length,
    attending: participants.filter((p) => p.status === "attending").length,
    cashPayments: participants.filter((p) => p.payment_method === "cash" && p.payment_id).length,
    unpaidCash: participants.filter(
      (p) =>
        p.payment_method === "cash" &&
        p.payment_id &&
        p.payment_status !== "paid" &&
        p.payment_status !== "received" &&
        p.payment_status !== "waived"
    ).length,
    pendingAttendees: participants.filter(
      (p) =>
        p.status === "attending" &&
        p.payment_method === "cash" &&
        p.payment_id &&
        p.payment_status !== "paid" &&
        p.payment_status !== "received" &&
        p.payment_status !== "waived"
    ).length,
  };

  return stats;
}

export function SmartBatchSelection({
  participants,
  selectedPaymentIds,
  onSelectionChange,
  isFreeEvent,
  isUpdating,
}: SmartBatchSelectionProps) {
  if (isFreeEvent) return null;

  const stats = getSmartSelectionCounts(participants);
  const hasSelection = selectedPaymentIds.length > 0;

  // スマート選択ハンドラー
  const handleSmartSelect = (type: string) => {
    let targetIds: string[] = [];

    switch (type) {
      case "all_cash":
        targetIds = participants
          .filter((p) => p.payment_method === "cash" && p.payment_id)
          .map((p) => p.payment_id)
          .filter((id): id is string => Boolean(id));
        break;

      case "unpaid_cash":
        targetIds = participants
          .filter(
            (p) =>
              p.payment_method === "cash" &&
              p.payment_id &&
              p.payment_status !== "paid" &&
              p.payment_status !== "received" &&
              p.payment_status !== "waived"
          )
          .map((p) => p.payment_id)
          .filter((id): id is string => Boolean(id));
        break;

      case "attending_unpaid":
        targetIds = participants
          .filter(
            (p) =>
              p.status === "attending" &&
              p.payment_method === "cash" &&
              p.payment_id &&
              p.payment_status !== "paid" &&
              p.payment_status !== "received" &&
              p.payment_status !== "waived"
          )
          .map((p) => p.payment_id)
          .filter((id): id is string => Boolean(id));
        break;

      case "clear":
        targetIds = [];
        break;

      default:
        return;
    }

    onSelectionChange(targetIds);
  };

  if (stats.cashPayments === 0) {
    return (
      <Card className="border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <CreditCard className="h-5 w-5" />
            <span className="text-sm">現金決済の参加者がいないため、一括選択は利用できません</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* 選択状況表示 */}
          <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-gray-900">
                  選択中: <span className="text-blue-600">{selectedPaymentIds.length}</span>件
                </span>
              </div>

              {hasSelection && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  選択済み
                </Badge>
              )}
            </div>

            {hasSelection && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSmartSelect("clear")}
                disabled={isUpdating}
                className="min-h-[44px]"
              >
                選択解除
              </Button>
            )}
          </div>

          {/* スマート選択ボタン群 */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">💡 スマート選択</div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 全現金決済選択 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSmartSelect("all_cash")}
                disabled={isUpdating || stats.cashPayments === 0}
                className="flex items-center gap-2 min-h-[44px] justify-start text-left"
              >
                <Banknote className="h-4 w-4 text-blue-600" />
                <div className="flex-1">
                  <div className="font-medium">現金決済</div>
                  <div className="text-xs text-gray-500">{stats.cashPayments}件</div>
                </div>
              </Button>

              {/* 未決済選択 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSmartSelect("unpaid_cash")}
                disabled={isUpdating || stats.unpaidCash === 0}
                className="flex items-center gap-2 min-h-[44px] justify-start text-left"
              >
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <div className="flex-1">
                  <div className="font-medium">未決済</div>
                  <div className="text-xs text-gray-500">{stats.unpaidCash}件</div>
                </div>
              </Button>

              {/* 出席予定×未決済選択 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSmartSelect("attending_unpaid")}
                disabled={isUpdating || stats.pendingAttendees === 0}
                className="flex items-center gap-2 min-h-[44px] justify-start text-left"
              >
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div className="flex-1">
                  <div className="font-medium">出席×未決済</div>
                  <div className="text-xs text-gray-500">{stats.pendingAttendees}件</div>
                </div>
              </Button>
            </div>
          </div>

          {/* 統計情報 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-blue-200">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500">総参加者</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-600">{stats.attending}</div>
              <div className="text-xs text-gray-500">出席予定</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-purple-600">{stats.cashPayments}</div>
              <div className="text-xs text-gray-500">現金決済</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-orange-600">{stats.unpaidCash}</div>
              <div className="text-xs text-gray-500">未決済</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
