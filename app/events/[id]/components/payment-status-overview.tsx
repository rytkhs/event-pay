"use client";

import { useState } from "react";

import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Banknote,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  PieChart,
} from "lucide-react";

import type { GetEventPaymentsResponse } from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface PaymentStatusOverviewProps {
  paymentsData: GetEventPaymentsResponse | null;
  expectedRevenue: number;
  isFreeEvent: boolean;
}

export function PaymentStatusOverview({
  paymentsData,
  expectedRevenue,
  isFreeEvent,
}: PaymentStatusOverviewProps) {
  const [showDetails, setShowDetails] = useState(false);

  // 無料イベントの場合は表示しない
  if (isFreeEvent) {
    return null;
  }

  const totalRevenue = paymentsData?.summary?.paidAmount ?? 0;
  const unpaidCount = paymentsData?.summary?.unpaidCount ?? 0;
  const unpaidAmount = paymentsData?.summary?.unpaidAmount ?? 0;
  const collectionProgress =
    expectedRevenue > 0 ? Math.round((totalRevenue / expectedRevenue) * 100) : 0;

  // 決済方法別の統計
  const stripeCount =
    paymentsData?.summary?.byMethod?.find((m) => m.method === "stripe")?.count ?? 0;
  const stripeAmount =
    paymentsData?.summary?.byMethod?.find((m) => m.method === "stripe")?.totalAmount ?? 0;
  const cashCount = paymentsData?.summary?.byMethod?.find((m) => m.method === "cash")?.count ?? 0;
  const cashAmount =
    paymentsData?.summary?.byMethod?.find((m) => m.method === "cash")?.totalAmount ?? 0;

  const totalPaidCount = stripeCount + cashCount;

  // ステータス判定
  const getProgressStatus = () => {
    if (collectionProgress >= 95)
      return { color: "bg-green-500", status: "完了間近", variant: "default" as const };
    if (collectionProgress >= 80)
      return { color: "bg-blue-500", status: "順調", variant: "default" as const };
    if (collectionProgress >= 50)
      return { color: "bg-yellow-500", status: "進行中", variant: "outline" as const };
    return { color: "bg-gray-400", status: "開始", variant: "secondary" as const };
  };

  const progressStatus = getProgressStatus();

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            集金状況
            <Badge variant={progressStatus.variant} className="text-xs">
              {progressStatus.status}
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* メインプログレスバー */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">進捗状況</span>
              <span className="text-muted-foreground">
                {collectionProgress}% ({totalPaidCount}件完了)
              </span>
            </div>
            <Progress value={collectionProgress} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>¥0</span>
              <span className="font-medium text-foreground">
                ¥{totalRevenue.toLocaleString()} / ¥{expectedRevenue.toLocaleString()}
              </span>
              <span>¥{expectedRevenue.toLocaleString()}</span>
            </div>
          </div>

          {/* 主要統計 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">完了</span>
              </div>
              <div className="text-lg font-bold text-green-900">
                ¥{totalRevenue.toLocaleString()}
              </div>
              <div className="text-xs text-green-600">{totalPaidCount}件</div>
            </div>

            {unpaidCount > 0 && (
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium text-orange-800">未完了</span>
                </div>
                <div className="text-lg font-bold text-orange-900">
                  ¥{unpaidAmount.toLocaleString()}
                </div>
                <div className="text-xs text-orange-600">{unpaidCount}件</div>
              </div>
            )}
          </div>

          {/* 詳細展開 */}
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                {showDetails ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-1" />
                    詳細を閉じる
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-1" />
                    詳細を表示
                  </>
                )}
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-3">
              <Separator className="mb-3" />

              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">決済方法別内訳</span>
                </div>

                {/* オンライン決済 */}
                {stripeCount > 0 && (
                  <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-800">オンライン決済</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-purple-900">
                        ¥{stripeAmount.toLocaleString()}
                      </div>
                      <div className="text-xs text-purple-600">{stripeCount}件</div>
                    </div>
                  </div>
                )}

                {/* 現金決済 */}
                {cashCount > 0 && (
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-orange-600" />
                      <span className="text-sm font-medium text-orange-800">現金決済</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-orange-900">
                        ¥{cashAmount.toLocaleString()}
                      </div>
                      <div className="text-xs text-orange-600">{cashCount}件</div>
                    </div>
                  </div>
                )}

                {/* 統計なしの場合 */}
                {totalPaidCount === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    <DollarSign className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm">まだ決済がありません</p>
                    <p className="text-xs">参加者の決済完了をお待ちください</p>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}
