"use client";

import { Users, AlertCircle, TrendingUp, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface KeyMetricsSummaryProps {
  attendingCount: number;
  capacity: number;
  collectionProgress: number;
  unpaidCount: number;
  totalRevenue: number;
  expectedRevenue: number;
  maybeCount?: number;
}

export function KeyMetricsSummary({
  attendingCount,
  capacity,
  collectionProgress,
  unpaidCount,
  totalRevenue,
  expectedRevenue,
  maybeCount = 0,
}: KeyMetricsSummaryProps) {
  // 参加率の計算
  const attendanceRate = capacity > 0 ? Math.round((attendingCount / capacity) * 100) : 0;

  // 各指標の状態判定（色コード）
  const getAttendanceStatus = () => {
    if (attendanceRate >= 90)
      return { color: "bg-green-500", label: "満員間近", variant: "default" as const };
    if (attendanceRate >= 70)
      return { color: "bg-yellow-500", label: "好調", variant: "outline" as const };
    if (attendanceRate >= 50)
      return { color: "bg-blue-500", label: "順調", variant: "default" as const };
    return { color: "bg-gray-400", label: "募集中", variant: "secondary" as const };
  };

  const getCollectionStatus = () => {
    if (collectionProgress >= 95)
      return { color: "bg-green-500", label: "完了間近", variant: "default" as const };
    if (collectionProgress >= 80)
      return { color: "bg-yellow-500", label: "良好", variant: "outline" as const };
    if (collectionProgress >= 50)
      return { color: "bg-blue-500", label: "進行中", variant: "default" as const };
    return { color: "bg-gray-400", label: "開始", variant: "secondary" as const };
  };

  const getUnpaidStatus = () => {
    if (unpaidCount === 0)
      return { color: "bg-green-500", label: "完了", variant: "default" as const };
    if (unpaidCount <= 2)
      return { color: "bg-yellow-500", label: "残り僅か", variant: "outline" as const };
    return { color: "bg-red-500", label: "要対応", variant: "destructive" as const };
  };

  const attendanceStatus = getAttendanceStatus();
  const collectionStatus = getCollectionStatus();
  const unpaidStatus = getUnpaidStatus();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {/* 参加状況 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-muted-foreground">参加状況</span>
            </div>
            <Badge variant={attendanceStatus.variant} className="text-xs">
              {attendanceStatus.label}
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{attendingCount}</span>
              <span className="text-sm text-muted-foreground">/ {capacity}人</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${attendanceStatus.color}`}
                style={{ width: `${Math.min(attendanceRate, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{attendanceRate}%</span>
              {maybeCount > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>未定 {maybeCount}人</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 集金進捗 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-muted-foreground">集金進捗</span>
            </div>
            <Badge variant={collectionStatus.variant} className="text-xs">
              {collectionStatus.label}
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{collectionProgress}</span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${collectionStatus.color}`}
                style={{ width: `${Math.min(collectionProgress, 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              ¥{totalRevenue.toLocaleString()} / ¥{expectedRevenue.toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 未決済件数 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium text-muted-foreground">未決済</span>
            </div>
            <Badge variant={unpaidStatus.variant} className="text-xs">
              {unpaidStatus.label}
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{unpaidCount}</span>
              <span className="text-sm text-muted-foreground">件</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${unpaidStatus.color}`}
                style={{
                  width:
                    unpaidCount === 0
                      ? "100%"
                      : `${Math.min((unpaidCount / Math.max(attendingCount, 1)) * 100, 100)}%`,
                }}
              />
            </div>
            {unpaidCount > 0 && (
              <div className="text-xs text-muted-foreground">
                未収 ¥{(expectedRevenue - totalRevenue).toLocaleString()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
