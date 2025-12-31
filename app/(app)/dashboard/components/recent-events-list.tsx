import Link from "next/link";

import { ja } from "date-fns/locale";
import { format, toZonedTime } from "date-fns-tz";
import { ArrowRight, Calendar, ChevronRight, CreditCard, Users } from "lucide-react";

import { getRecentEventsAction } from "@features/events/actions/get-dashboard-stats";

import { cn } from "@/components/ui/_lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
// 日本語通貨フォーマット
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

// ステータスごとの設定
const statusConfig = {
  upcoming: {
    label: "予定",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  ongoing: {
    label: "開催中",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  past: {
    label: "終了",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
  },
  canceled: {
    label: "中止",
    badgeClass: "bg-red-50 text-red-600 border-red-200",
  },
};

// 整理されたステータスバッジ
function getStatusBadge(status: string) {
  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0 sm:py-0.5 font-medium border rounded-md",
        config.badgeClass
      )}
    >
      {config.label}
    </Badge>
  );
}

export async function RecentEventsList() {
  const result = await getRecentEventsAction();
  const events = result.success && result.data ? result.data : [];

  return (
    <Card className="border shadow-sm overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-muted/60 to-muted/30 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <CardTitle className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2">
              最近のイベント
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              開催日が近いイベントの状況
            </p>
          </div>
          <Button
            asChild
            variant="link"
            size="sm"
            className="text-xs sm:text-sm text-muted-foreground hover:text-primary gap-1 pr-0 font-medium"
          >
            <Link href="/events">
              すべて表示 <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-150" />
              <div className="relative bg-gradient-to-br from-primary/20 to-primary/5 p-5 rounded-full border border-primary/10">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">まだイベントがありません</p>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              新しいイベントを作成して集金を開始しましょう
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/events/create">はじめてのイベントを作成</Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {events.slice(0, 5).map((event) => {
              // 日付フォーマット処理 (例: 12/15(金) 14:00)
              const jstDate = toZonedTime(new Date(event.date), "Asia/Tokyo");
              const dateStr = format(jstDate, "M/d(E) HH:mm", { locale: ja });

              // 参加率計算
              const capacity = event.capacity || 0;
              const occupancy =
                capacity > 0
                  ? Math.min(Math.round((event.attendances_count / capacity) * 100), 100)
                  : 0;
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className={cn(
                    "group relative flex flex-col sm:flex-row sm:items-center sm:justify-between",
                    "py-3.5 px-4 sm:py-4 sm:px-6",
                    "hover:bg-muted/40 active:bg-muted/60",
                    "transition-all duration-200",
                    "outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  )}
                >
                  {/* 左側：メイン情報 */}
                  <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-1">
                    {/* タイトル行 */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      <h3 className="font-semibold text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors">
                        {event.title}
                      </h3>
                      {getStatusBadge(event.status)}
                    </div>

                    {/* メタデータ行 */}
                    <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-muted-foreground">
                      {/* 日時 */}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground/70" />
                        <span className="tabular-nums font-medium text-xs sm:text-sm">
                          {dateStr}
                        </span>
                      </div>

                      {/* 参加人数 & プログレスバー */}
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground/70" />
                        <span className="text-xs sm:text-sm">
                          <span className="font-semibold text-foreground">
                            {event.attendances_count}
                          </span>
                          {event.capacity && (
                            <span className="text-muted-foreground/60">/{event.capacity}</span>
                          )}
                          <span className="text-muted-foreground/60 hidden sm:inline">名</span>
                        </span>

                        {/* 参加率プログレスバー (定員設定時のみ・PC) */}
                        {event.capacity && (
                          <div className="hidden sm:block w-12 lg:w-16 ml-0.5">
                            <Progress value={occupancy} className="h-1.5 w-full bg-muted" />
                          </div>
                        )}
                      </div>

                      {/* 金額（設定がある場合のみ） */}
                      {event.fee > 0 && (
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground/70" />
                          <span className="tabular-nums text-xs sm:text-sm font-medium">
                            {formatCurrency(event.fee)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 右側：アクションインジケーター */}
                  <div className="hidden sm:flex items-center text-muted-foreground/50 group-hover:text-primary transition-colors pl-4">
                    <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
