"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettlementReportData } from "@/lib/services/settlement-report/types";
// Format currency helper
const formatCurrency = (amount: number) => {
  return amount === 0 ? "無料" : `${amount.toLocaleString()}円`;
};
import { CalendarIcon, CreditCardIcon, TrendingDownIcon } from "lucide-react";
import { formatUtcToJst } from "@/lib/utils/timezone";

interface SettlementReportCardProps {
  report: SettlementReportData;
  onRegenerate?: (eventId: string) => void;
  isRegenerating?: boolean;
  showActions?: boolean;
}

export function SettlementReportCard({
  report,
  onRegenerate,
  isRegenerating = false,
  showActions = true,
}: SettlementReportCardProps) {
  const formatDate = (dateString: string) => {
    return formatUtcToJst(new Date(dateString), "yyyy年MM月dd日");
  };

  const formatDateTime = (date: Date) => {
    return formatUtcToJst(date, "yyyy年MM月dd日 HH:mm");
  };

  const hasRefunds = report.refundedCount > 0 || report.totalRefundedAmount > 0;

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">{report.eventTitle}</CardTitle>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-1">
                <CalendarIcon className="w-4 h-4" />
                <span>イベント日: {formatDate(report.eventDate)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <span>レポート生成: {formatDateTime(report.generatedAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">
              {report.settlementMode === "destination_charge"
                ? "Destination Charges"
                : report.settlementMode}
            </Badge>
            <Badge variant={report.status === "completed" ? "default" : "secondary"}>
              {report.status === "completed" ? "完了" : report.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 金額サマリー */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">売上合計</p>
            <p className="text-lg font-semibold text-green-600">
              {formatCurrency(report.totalStripeSales)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Stripe手数料</p>
            <p className="text-lg font-semibold text-red-600">
              -{formatCurrency(report.totalStripeFee)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">プラットフォーム手数料</p>
            <p className="text-lg font-semibold text-red-600">
              -{formatCurrency(report.totalApplicationFee)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">手取り額</p>
            <p className="text-xl font-bold text-blue-600">
              {formatCurrency(report.netPayoutAmount)}
            </p>
          </div>
        </div>

        {/* 決済・返金情報 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t">
          <div className="flex items-center space-x-2">
            <CreditCardIcon className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">決済件数</p>
              <p className="text-lg font-semibold">{report.totalPaymentCount} 件</p>
            </div>
          </div>

          {hasRefunds && (
            <>
              <div className="flex items-center space-x-2">
                <TrendingDownIcon className="w-4 h-4 text-red-500" />
                <div>
                  <p className="text-sm font-medium">返金件数</p>
                  <p className="text-lg font-semibold text-red-600">{report.refundedCount} 件</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingDownIcon className="w-4 h-4 text-red-500" />
                <div>
                  <p className="text-sm font-medium">返金額</p>
                  <p className="text-lg font-semibold text-red-600">
                    {formatCurrency(report.totalRefundedAmount)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 詳細情報 */}
        <div className="pt-4 border-t">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">Transfer Group</p>
              <p className="font-mono text-xs">{report.transferGroup}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Stripe Account ID</p>
              <p className="font-mono text-xs">{report.stripeAccountId}</p>
            </div>
          </div>
        </div>

        {/* アクション */}
        {showActions && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {hasRefunds && (
                <span className="text-orange-600">
                  ※ 返金が発生しています。必要に応じて再集計してください。
                </span>
              )}
            </div>
            <div className="flex space-x-2">
              {onRegenerate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRegenerate(report.eventId)}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? "再集計中..." : "再集計"}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
