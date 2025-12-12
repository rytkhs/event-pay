import Link from "next/link";

import { Calendar, Clock, DollarSign, ExternalLink, UserCheck } from "lucide-react";

import { formatUtcToJst } from "@core/utils/timezone";

import { getRecentEventsAction } from "@features/events/actions/get-dashboard-stats";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

function getStatusBadge(status: string) {
  const statusConfig = {
    upcoming: { label: "開催予定", variant: "default" as const },
    ongoing: { label: "開催中", variant: "secondary" as const },
    past: { label: "終了", variant: "outline" as const },
    canceled: { label: "中止", variant: "destructive" as const },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    variant: "default" as const,
  };

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
}

export async function RecentEventsList() {
  const result = await getRecentEventsAction();
  const events = result.success && result.data ? result.data : [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg font-semibold">最近のイベント</CardTitle>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground text-xs sm:text-sm"
          >
            <Link href="/events" className="flex items-center">
              <span className="hidden xs:inline">すべて表示</span>
              <span className="inline xs:hidden">すべて</span>
              <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {events.length === 0 ? (
          <div className="text-center py-6 bg-muted rounded-lg">
            <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">まだイベントがありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.slice(0, 5).map((event) => (
              <div
                key={event.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors gap-3 sm:gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 sm:mb-1">
                    <h3 className="text-sm font-medium text-foreground truncate flex-1">
                      {event.title}
                    </h3>
                    {getStatusBadge(event.status)}
                  </div>
                  <div className="flex flex-col xs:flex-row xs:items-center text-xs text-muted-foreground gap-2 xs:gap-3">
                    <span className="flex items-center">
                      <Clock className="h-3 w-3 mr-1 flex-shrink-0" />
                      {formatUtcToJst(event.date, "MM/dd HH:mm")}
                    </span>
                    <span className="flex items-center">
                      <UserCheck className="h-3 w-3 mr-1 flex-shrink-0" />
                      {event.attendances_count}
                      {event.capacity && `/${event.capacity}`}名
                    </span>
                    {event.fee > 0 && (
                      <span className="flex items-center">
                        <DollarSign className="h-3 w-3 mr-1 flex-shrink-0" />
                        {formatCurrency(event.fee)}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="self-start sm:self-center sm:ml-2 text-xs"
                >
                  <Link href={`/events/${event.id}`}>詳細</Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
