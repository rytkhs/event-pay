"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Banknote, AlertTriangle, CheckCircle, Info } from "lucide-react";
import type { PaymentSummary as PaymentSummaryType } from "@core/validation/participant-management";
import { TooltipContent, TooltipTrigger, TooltipWrapper } from "@/components/ui/tooltip";
import { PAYMENT_STATUS_LABELS } from "@/types/enums";

interface PaymentSummaryProps {
  summary: PaymentSummaryType;
  isLoading?: boolean;
}

export function PaymentSummary({ summary, isLoading = false }: PaymentSummaryProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>決済状況</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 方法別データの準備
  const stripeData = summary.byMethod.find((m) => m.method === "stripe");
  const cashData = summary.byMethod.find((m) => m.method === "cash");

  // 未決済ハイライト判定
  const hasUnpaidPayments = summary.unpaidCount > 0;

  const STATUS_META: Record<
    PaymentSummaryType["byStatus"][number]["status"],
    { bg: string; text: string; label: string }
  > = {
    paid: { bg: "bg-blue-50", text: "text-blue-600", label: PAYMENT_STATUS_LABELS.paid },
    received: { bg: "bg-green-50", text: "text-green-600", label: PAYMENT_STATUS_LABELS.received },
    completed: {
      bg: "bg-emerald-50",
      text: "text-emerald-600",
      label: PAYMENT_STATUS_LABELS.completed,
    },
    pending: { bg: "bg-yellow-50", text: "text-yellow-600", label: PAYMENT_STATUS_LABELS.pending },
    failed: { bg: "bg-red-50", text: "text-red-600", label: PAYMENT_STATUS_LABELS.failed },
    refunded: {
      bg: "bg-purple-50",
      text: "text-purple-600",
      label: PAYMENT_STATUS_LABELS.refunded,
    },
    waived: { bg: "bg-indigo-50", text: "text-indigo-600", label: PAYMENT_STATUS_LABELS.waived },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          決済状況（イベント全体）
          {hasUnpaidPayments && (
            <Badge variant="destructive" className="ml-2">
              <AlertTriangle className="w-3 h-3 mr-1" />
              未決済あり
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 全体サマリー */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600" data-testid="total-payments">
              {summary.totalPayments}
            </div>
            <div className="text-sm text-gray-600">総決済数</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600" data-testid="total-amount">
              ¥{summary.totalAmount.toLocaleString()}
            </div>
            {/* 決済総額は未決済・失敗を含む全ステータス合算。参加者ごとに最新取引のみ集計である旨をツールチップで補足 */}
            <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
              <span>総金額（全ステータス）</span>
              <TooltipWrapper>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 cursor-pointer text-gray-400" aria-label="説明" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  各参加者の最新取引 1 件のみを合算した金額です
                </TooltipContent>
              </TooltipWrapper>
            </div>
          </div>
          <div className="text-center p-4 bg-emerald-50 rounded-lg">
            <div
              className="text-2xl font-bold text-emerald-600 flex items-center justify-center gap-1"
              data-testid="paid-summary"
            >
              <CheckCircle className="w-5 h-5" />
              {summary.paidCount}
            </div>
            <div className="text-sm text-gray-600">
              決済済み・¥{summary.paidAmount.toLocaleString()}
            </div>
          </div>
          <div
            className={`text-center p-4 rounded-lg ${hasUnpaidPayments ? "bg-red-50" : "bg-gray-50"}`}
          >
            <div
              className={`text-2xl font-bold flex items-center justify-center gap-1 ${hasUnpaidPayments ? "text-red-600" : "text-gray-600"}`}
              data-testid="unpaid-summary"
            >
              {hasUnpaidPayments && <AlertTriangle className="w-5 h-5" />}
              {summary.unpaidCount}
            </div>
            <div className="text-sm text-gray-600">
              未決済・¥{summary.unpaidAmount.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 決済方法別 */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">決済方法別</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900">Stripe決済</span>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-blue-600" data-testid="stripe-count">
                  {stripeData?.count || 0}件
                </div>
                <div className="text-sm text-gray-600" data-testid="stripe-amount">
                  ¥{(stripeData?.totalAmount || 0).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Banknote className="w-5 h-5 text-green-600" />
                <span className="font-medium text-gray-900">現金決済</span>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-green-600" data-testid="cash-count">
                  {cashData?.count || 0}件
                </div>
                <div className="text-sm text-gray-600" data-testid="cash-amount">
                  ¥{(cashData?.totalAmount || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ステータス別詳細（0件でないもののみ表示） */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">ステータス別内訳</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary.byStatus
              .filter((s) => s.count > 0)
              .map((status) => {
                const meta = STATUS_META[status.status];
                return (
                  <div key={status.status} className={`text-center p-3 ${meta.bg} rounded-lg`}>
                    <div
                      className={`text-lg font-bold ${meta.text}`}
                      data-testid={`status-${status.status}-count`}
                    >
                      {status.count}
                    </div>
                    <div className="text-xs text-gray-600 mb-1">{meta.label}</div>
                    <div
                      className="text-xs text-gray-500"
                      data-testid={`status-${status.status}-amount`}
                    >
                      ¥{status.totalAmount.toLocaleString()}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
