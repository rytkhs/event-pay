"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface StatusBarProps {
  eventId: string;
  attendingCount: number;
  capacity: number;
  totalRevenue: number;
  expectedRevenue: number;
  unpaidCount: number;
}

export function StatusBar({
  eventId,
  attendingCount,
  capacity,
  totalRevenue,
  expectedRevenue,
  unpaidCount,
}: StatusBarProps) {
  const router = useRouter();
  // 参加率計算
  const attendanceRate = capacity > 0 ? Math.round((attendingCount / capacity) * 100) : 0;

  // 集金進捗率計算
  const collectionProgress =
    expectedRevenue > 0 ? Math.round((totalRevenue / expectedRevenue) * 100) : 0;

  // プログレスバーの色を動的に設定
  const getAttendanceColor = (rate: number) => {
    if (rate >= 90) return "bg-destructive"; // 定員間近
    if (rate >= 70) return "bg-warning"; // 注意
    return "bg-primary"; // 正常
  };

  const getCollectionColor = (progress: number) => {
    if (progress >= 80) return "bg-success"; // 順調
    if (progress >= 50) return "bg-warning"; // 注意
    return "bg-destructive"; // 要注意
  };

  const handleManageParticipants = () => {
    router.push(`/events/${eventId}/participants`);
  };

  return (
    <div className="bg-white border border-border rounded-lg p-4 mb-6">
      <div className="flex flex-col space-y-4">
        {/* プログレスバー */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 参加状況 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">参加状況</h3>
              <span className="text-sm text-muted-foreground">
                {attendingCount} / {capacity}人 ({attendanceRate}%)
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-full rounded-full transition-all ${getAttendanceColor(attendanceRate)}`}
                style={{ width: `${Math.min(attendanceRate, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0人</span>
              <span>{capacity}人 (定員)</span>
            </div>
          </div>

          {/* 集金状況 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">集金進捗</h3>
              <span className="text-sm text-muted-foreground">
                ¥{totalRevenue.toLocaleString()} / ¥{expectedRevenue.toLocaleString()} (
                {collectionProgress}%)
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-full rounded-full transition-all ${getCollectionColor(collectionProgress)}`}
                style={{ width: `${Math.min(collectionProgress, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>¥0</span>
              <span>¥{expectedRevenue.toLocaleString()} (目標)</span>
            </div>
            {unpaidCount > 0 && (
              <p className="text-xs text-destructive mt-1">未決済: {unpaidCount}件</p>
            )}
          </div>
        </div>

        {/* 参加者管理ボタン */}
        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={handleManageParticipants} className="bg-blue-600 hover:bg-blue-700">
            🎛️ 参加者を管理する
          </Button>
        </div>
      </div>
    </div>
  );
}
