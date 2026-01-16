import { CalendarDays, DollarSign, Users } from "lucide-react";

import { getDashboardStatsAction } from "@features/events";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

export async function DashboardStatsCards() {
  const result = await getDashboardStatsAction();

  if (!result.success || !result.data) {
    // エラー時は0を表示、あるいはエラーUIでも良いが、並列ロードの一部なので0でフォールバック
    return (
      <StatsCardsContent
        upcomingEventsCount={0}
        totalUpcomingParticipants={0}
        unpaidFeesTotal={0}
      />
    );
  }

  const stats = result.data;

  return (
    <StatsCardsContent
      upcomingEventsCount={stats.upcomingEventsCount}
      totalUpcomingParticipants={stats.totalUpcomingParticipants}
      unpaidFeesTotal={stats.unpaidFeesTotal}
    />
  );
}

function StatsCardsContent({
  upcomingEventsCount,
  totalUpcomingParticipants,
  unpaidFeesTotal,
}: {
  upcomingEventsCount: number;
  totalUpcomingParticipants: number;
  unpaidFeesTotal: number;
}) {
  return (
    <>
      <Card className="relative overflow-hidden border-0 bg-blue-50/30 shadow-sm">
        <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-100 p-2">
              <CalendarDays className="h-4 w-4 text-blue-600" />
            </div>
            <CardTitle className="text-sm font-semibold text-gray-700">開催予定</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="relative pt-0">
          <div className="flex items-baseline gap-2">
            <div className="text-xl font-bold text-gray-900">{upcomingEventsCount}</div>
            <div className="text-sm text-gray-500">件</div>
          </div>
          <div className="mt-2 text-xs text-gray-500">今後のイベント数</div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border-0 bg-purple-50/30 shadow-sm">
        <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-purple-100 p-2">
              <Users className="h-4 w-4 text-purple-600" />
            </div>
            <CardTitle className="text-sm font-semibold text-gray-700">参加予定</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="relative pt-0">
          <div className="flex items-baseline gap-2">
            <div className="text-xl font-bold text-gray-900">{totalUpcomingParticipants}</div>
            <div className="text-sm text-gray-500">名</div>
          </div>
          <div className="mt-2 text-xs text-gray-500">今後の参加予定者</div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border-0 bg-amber-50/30 shadow-sm">
        <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-100 p-2">
              <DollarSign className="h-4 w-4 text-amber-600" />
            </div>
            <CardTitle className="text-sm font-semibold text-gray-700">未集金</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="relative pt-0">
          <div className="text-xl font-bold text-gray-900 leading-tight">
            {formatCurrency(unpaidFeesTotal)}
          </div>
          <div className="mt-2 text-xs text-gray-500">集金待ちの金額</div>
        </CardContent>
      </Card>
    </>
  );
}
