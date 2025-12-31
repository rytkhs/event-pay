import { CalendarDays, DollarSign, Users } from "lucide-react";

import { getDashboardStatsAction } from "@features/events/actions/get-dashboard-stats";

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
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
            開催予定イベント
          </CardTitle>
          <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-2xl sm:text-3xl font-bold text-primary mb-1">
            {upcomingEventsCount}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
            参加予定者
          </CardTitle>
          <Users className="h-4 w-4 sm:h-5 sm:w-5 text-secondary flex-shrink-0" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-2xl sm:text-3xl font-bold text-secondary mb-1">
            {totalUpcomingParticipants}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
            未集金の参加費
          </CardTitle>
          <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-warning flex-shrink-0" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-lg sm:text-2xl lg:text-3xl font-bold text-warning mb-1 leading-tight">
            {formatCurrency(unpaidFeesTotal)}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
