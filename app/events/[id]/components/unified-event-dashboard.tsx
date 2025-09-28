"use client";

import { useState } from "react";

import {
  Users,
  TrendingUp,
  AlertCircle,
  Clock,
  CreditCard,
  Banknote,
  Eye,
  EyeOff,
} from "lucide-react";

import type { GetEventPaymentsResponse } from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface UnifiedEventDashboardProps {
  attendingCount: number;
  capacity: number;
  maybeCount?: number;
  totalRevenue: number;
  expectedRevenue: number;
  unpaidCount: number;
  unpaidAmount: number;
  isFreeEvent: boolean;
  paymentsData: GetEventPaymentsResponse | null;
}

export function UnifiedEventDashboard({
  attendingCount,
  capacity,
  maybeCount = 0,
  totalRevenue,
  expectedRevenue,
  unpaidCount,
  unpaidAmount,
  isFreeEvent,
  paymentsData,
}: UnifiedEventDashboardProps) {
  const [showDetails, setShowDetails] = useState(false);

  // 参加率と集金進捗率の計算
  const attendanceRate = capacity > 0 ? Math.round((attendingCount / capacity) * 100) : 0;
  const collectionProgress =
    expectedRevenue > 0 ? Math.round((totalRevenue / expectedRevenue) * 100) : 0;

  // ステータス判定
  const getAttendanceStatus = () => {
    if (attendanceRate >= 90)
      return {
        color: "text-green-600",
        bgColor: "bg-green-500",
        label: "満員間近",
        variant: "default" as const,
      };
    if (attendanceRate >= 70)
      return {
        color: "text-blue-600",
        bgColor: "bg-blue-500",
        label: "順調",
        variant: "default" as const,
      };
    if (attendanceRate >= 50)
      return {
        color: "text-yellow-600",
        bgColor: "bg-yellow-500",
        label: "進行中",
        variant: "secondary" as const,
      };
    return {
      color: "text-gray-600",
      bgColor: "bg-gray-400",
      label: "募集中",
      variant: "secondary" as const,
    };
  };

  const getCollectionStatus = () => {
    if (collectionProgress >= 95)
      return {
        color: "text-green-600",
        bgColor: "bg-green-500",
        label: "完了間近",
        variant: "default" as const,
      };
    if (collectionProgress >= 80)
      return {
        color: "text-blue-600",
        bgColor: "bg-blue-500",
        label: "順調",
        variant: "default" as const,
      };
    if (collectionProgress >= 50)
      return {
        color: "text-yellow-600",
        bgColor: "bg-yellow-500",
        label: "進行中",
        variant: "secondary" as const,
      };
    return {
      color: "text-gray-600",
      bgColor: "bg-gray-400",
      label: "開始",
      variant: "secondary" as const,
    };
  };

  const attendanceStatus = getAttendanceStatus();
  const collectionStatus = getCollectionStatus();

  // 決済方法別の統計
  const stripeCount =
    paymentsData?.summary?.byMethod?.find((m) => m.method === "stripe")?.count ?? 0;
  const stripeAmount =
    paymentsData?.summary?.byMethod?.find((m) => m.method === "stripe")?.totalAmount ?? 0;
  const cashCount = paymentsData?.summary?.byMethod?.find((m) => m.method === "cash")?.count ?? 0;
  const cashAmount =
    paymentsData?.summary?.byMethod?.find((m) => m.method === "cash")?.totalAmount ?? 0;

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-4">
        <div className="text-center">
          <CardTitle className="text-xl font-bold mb-2">イベント状況</CardTitle>
          {/* <p className="text-sm text-muted-foreground">一目でわかる重要指標</p> */}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-6">
          {/* 参加状況 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="font-medium">参加状況</span>
              </div>
              <Badge variant={attendanceStatus.variant} className="text-xs">
                {attendanceStatus.label}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{attendingCount}</span>
                  <span className="text-muted-foreground">/ {capacity}人</span>
                </div>
                <span className={`text-lg font-bold ${attendanceStatus.color}`}>
                  {attendanceRate}%
                </span>
              </div>

              <Progress value={attendanceRate} className="h-3">
                <div
                  className={`h-full rounded-full transition-all ${attendanceStatus.bgColor}`}
                  style={{ width: `${Math.min(attendanceRate, 100)}%` }}
                />
              </Progress>

              {maybeCount > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>未定 {maybeCount}人</span>
                </div>
              )}
            </div>
          </div>

          {/* 集金状況（有料イベントのみ） */}
          {!isFreeEvent && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <span className="font-medium">集金状況</span>
                </div>
                <Badge variant={collectionStatus.variant} className="text-xs">
                  {collectionStatus.label}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold">¥{totalRevenue.toLocaleString()}</span>
                    <span className="text-muted-foreground">
                      / ¥{expectedRevenue.toLocaleString()}
                    </span>
                  </div>
                  <span className={`text-lg font-bold ${collectionStatus.color}`}>
                    {collectionProgress}%
                  </span>
                </div>

                <Progress value={collectionProgress} className="h-3">
                  <div
                    className={`h-full rounded-full transition-all ${collectionStatus.bgColor}`}
                    style={{ width: `${Math.min(collectionProgress, 100)}%` }}
                  />
                </Progress>

                {unpaidCount > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-orange-600">
                      <AlertCircle className="h-3 w-3" />
                      <span>未決済: {unpaidCount}件</span>
                    </div>
                    <span className="font-medium text-orange-600">
                      ¥{unpaidAmount.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 詳細表示の展開 */}
          {!isFreeEvent && (stripeCount > 0 || cashCount > 0) && (
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
                      支払い方法別の詳細を表示
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-3">
                <Separator className="mb-4" />

                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">決済方法別の内訳</h4>

                  <div className="grid gap-3">
                    {/* オンライン決済 */}
                    {stripeCount > 0 && (
                      <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 rounded-lg">
                            <CreditCard className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <div className="font-medium text-purple-800">オンライン決済</div>
                            <div className="text-xs text-purple-600">{stripeCount}件完了</div>
                          </div>
                        </div>
                        <div className="text-lg font-bold text-purple-900">
                          ¥{stripeAmount.toLocaleString()}
                        </div>
                      </div>
                    )}

                    {/* 現金決済 */}
                    {cashCount > 0 && (
                      <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-orange-100 rounded-lg">
                            <Banknote className="h-4 w-4 text-orange-600" />
                          </div>
                          <div>
                            <div className="font-medium text-orange-800">現金決済</div>
                            <div className="text-xs text-orange-600">{cashCount}件完了</div>
                          </div>
                        </div>
                        <div className="text-lg font-bold text-orange-900">
                          ¥{cashAmount.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
