"use client";

import { Users, TrendingUp, AlertCircle, Clock, HelpCircle } from "lucide-react";

import type { GetEventPaymentsResponse } from "@core/validation/participant-management";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface KpiCardsGridProps {
  attendingCount: number;
  capacity: number | null;
  maybeCount: number;
  totalRevenue: number;
  expectedRevenue: number;
  unpaidCount: number;
  unpaidAmount: number;
  isFreeEvent: boolean;
  paymentsData: GetEventPaymentsResponse | null;
}

export function KpiCardsGrid({
  attendingCount,
  capacity,
  maybeCount,
  totalRevenue,
  expectedRevenue,
  unpaidCount,
  unpaidAmount,
  isFreeEvent,
}: KpiCardsGridProps) {
  // 参加率と集金進捗率の計算
  const attendanceRate =
    capacity && capacity > 0 ? Math.round((attendingCount / capacity) * 100) : null;
  const collectionProgress =
    expectedRevenue > 0 ? Math.round((totalRevenue / expectedRevenue) * 100) : 0;

  // 定員に近い場合の警告色
  const isNearCapacity = attendanceRate !== null && attendanceRate >= 90;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {/* 参加者数カード */}
      <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-blue-700">参加者数</span>
            {maybeCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                    <Clock className="h-3 w-3" />
                    <span>+{maybeCount}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>未定: {maybeCount}人</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-blue-900">{attendingCount}</span>
              {capacity !== null && <span className="text-sm text-blue-600">/ {capacity}人</span>}
            </div>

            {capacity !== null && attendanceRate !== null && (
              <>
                <Progress
                  value={attendanceRate}
                  className={`h-2 ${isNearCapacity ? "[&>div]:bg-orange-500" : "[&>div]:bg-blue-500"}`}
                />
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium ${isNearCapacity ? "text-orange-600" : "text-blue-600"}`}
                  >
                    {attendanceRate}%
                  </span>
                  {isNearCapacity && (
                    <span className="text-xs text-orange-600 font-medium">定員間近</span>
                  )}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 集金進捗カード（有料イベントのみ） */}
      {!isFreeEvent && (
        <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-emerald-100/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-green-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-xs font-medium text-green-700">集金進捗</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="cursor-help">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>参加確定者の支払い状況</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-green-900">
                  ¥{totalRevenue.toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-green-600">/ ¥{expectedRevenue.toLocaleString()}</div>

              <Progress value={collectionProgress} className="h-2 [&>div]:bg-green-500" />
              <span className="text-xs font-medium text-green-600">{collectionProgress}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 未決済カード（有料イベント かつ 未決済がある場合のみ） */}
      {!isFreeEvent && unpaidCount > 0 && (
        <Card className="border-0 shadow-sm bg-gradient-to-br from-orange-50 to-amber-100/50 col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-orange-100 rounded-lg">
                <AlertCircle className="h-4 w-4 text-orange-600" />
              </div>
              <span className="text-xs font-medium text-orange-700">未決済</span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-orange-900">{unpaidCount}</span>
                  <span className="text-sm text-orange-600">件</span>
                </div>
                <div className="text-sm font-medium text-orange-700 mt-0.5">
                  ¥{unpaidAmount.toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                要対応
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 無料イベントまたは未決済なしの場合、3列目を埋めるための空スペース調整 */}
      {isFreeEvent && (
        <Card className="border-0 shadow-sm bg-gradient-to-br from-gray-50 to-gray-100/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-gray-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-gray-500" />
              </div>
              <span className="text-xs font-medium text-gray-600">参加費</span>
            </div>
            <div className="text-2xl font-bold text-gray-700">無料</div>
            <div className="text-xs text-muted-foreground mt-1">決済処理なし</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
