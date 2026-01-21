"use client";

import { Users, TrendingUp, Clock, HelpCircle } from "lucide-react";
import { Pie, PieChart, Label } from "recharts";

import { cn } from "@/components/ui/_lib/cn";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface KpiCardsGridProps {
  attendingCount: number;
  capacity: number | null;
  maybeCount: number;
  totalRevenue: number;
  expectedRevenue: number;
  isFreeEvent: boolean;
}

export function KpiCardsGrid({
  attendingCount,
  capacity,
  maybeCount,
  totalRevenue,
  expectedRevenue,
  isFreeEvent,
}: KpiCardsGridProps) {
  // 参加率と集金進捗率の計算
  const attendanceRate =
    capacity && capacity > 0 ? Math.round((attendingCount / capacity) * 100) : null;
  const collectionProgress =
    expectedRevenue > 0 ? Math.round((totalRevenue / expectedRevenue) * 100) : 0;

  // 定員に近い場合の警告色
  const isNearCapacity = attendanceRate !== null && attendanceRate >= 90;

  // チャート設定
  const attendanceChartConfig = {
    attending: {
      label: "参加",
      color: isNearCapacity ? "hsl(var(--warning))" : "hsl(var(--info))",
    },
    remaining: {
      label: "空き",
      color: "hsl(var(--muted))",
    },
  } satisfies ChartConfig;

  const collectionChartConfig = {
    collected: {
      label: "集金済み",
      color: "hsl(var(--success))",
    },
    remaining: {
      label: "未集金",
      color: "hsl(var(--muted))",
    },
  } satisfies ChartConfig;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* 参加者数カード */}
      <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50 overflow-hidden">
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

          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-blue-900">{attendingCount}</span>
                {capacity !== null && <span className="text-sm text-blue-600">/ {capacity}人</span>}
              </div>
              {isNearCapacity && (
                <div className="text-[10px] text-orange-600 font-semibold bg-orange-100/50 px-1.5 py-0.5 rounded-full w-fit">
                  定員間近
                </div>
              )}
            </div>

            {capacity !== null && attendanceRate !== null && (
              <div className="h-16 w-16 shrink-0">
                <ChartContainer
                  config={attendanceChartConfig}
                  className="aspect-square h-full w-full"
                >
                  <PieChart>
                    <Pie
                      data={[
                        {
                          name: "attending",
                          value: attendingCount,
                          fill: "var(--color-attending)",
                        },
                        {
                          name: "remaining",
                          value: Math.max(0, capacity - attendingCount),
                          fill: "var(--color-remaining)",
                        },
                      ]}
                      dataKey="value"
                      innerRadius={20}
                      outerRadius={30}
                      strokeWidth={0}
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                    >
                      <Label
                        content={({ viewBox }) => {
                          if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                            return (
                              <text
                                x={viewBox.cx}
                                y={viewBox.cy}
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                <tspan
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  className={cn(
                                    "text-[10px] font-bold tabular-nums",
                                    isNearCapacity ? "fill-orange-600" : "fill-blue-700"
                                  )}
                                >
                                  {attendanceRate}%
                                </tspan>
                              </text>
                            );
                          }
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 集金進捗カード（有料イベントのみ） */}
      {!isFreeEvent && (
        <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-emerald-100/50 overflow-hidden">
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

            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-green-900 truncate">
                    ¥{totalRevenue.toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-green-600 truncate">
                  / ¥{expectedRevenue.toLocaleString()}
                </div>
              </div>

              <div className="h-16 w-16 shrink-0">
                <ChartContainer
                  config={collectionChartConfig}
                  className="aspect-square h-full w-full"
                >
                  <PieChart>
                    <Pie
                      data={[
                        { name: "collected", value: totalRevenue, fill: "var(--color-collected)" },
                        {
                          name: "remaining",
                          value: Math.max(0, expectedRevenue - totalRevenue),
                          fill: "var(--color-remaining)",
                        },
                      ]}
                      dataKey="value"
                      innerRadius={20}
                      outerRadius={30}
                      strokeWidth={0}
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                    >
                      <Label
                        content={({ viewBox }) => {
                          if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                            return (
                              <text
                                x={viewBox.cx}
                                y={viewBox.cy}
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                <tspan
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  className="fill-green-700 text-[10px] font-bold tabular-nums"
                                >
                                  {collectionProgress}%
                                </tspan>
                              </text>
                            );
                          }
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 無料イベントまたは未決済なしの場合、2列目を埋めるための空スペース調整 */}
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
            <div className="text-xs text-muted-foreground mt-1 text-slate-500">決済処理なし</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
