import Link from "next/link";

import { ArrowRight, Calendar } from "lucide-react";

import { getRecentEventsAction, EventCard } from "@features/events";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
            {events.slice(0, 5).map((event) => (
              <EventCard key={event.id} event={event} mode="compact" />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
