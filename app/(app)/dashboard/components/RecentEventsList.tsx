import Link from "next/link";

import { ArrowRight, Calendar } from "lucide-react";

import type { RecentEvent } from "@features/events/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { DashboardDataResource } from "../_lib/dashboard-data";

import { DashboardRecentEventItem } from "./DashboardRecentEventItem";

export async function RecentEventsList({
  dashboardDataResource,
}: {
  dashboardDataResource: Promise<DashboardDataResource>;
}) {
  let events: RecentEvent[] | null = null;

  try {
    const { recentEvents } = await dashboardDataResource;
    events = await recentEvents;
  } catch {
    events = null;
  }

  return (
    <Card className="bg-white/55 dark:bg-card/40 backdrop-blur-sm border-border/70 shadow-sm rounded-2xl md:rounded-3xl overflow-hidden">
      <CardHeader className="border-b border-border/50 px-5 sm:px-7 py-4 sm:py-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-[16px] sm:text-[18px] font-bold tracking-tight flex items-center gap-2">
              最近のイベント
            </CardTitle>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-[12px] sm:text-[13px] text-muted-foreground hover:text-primary gap-1 pr-1 font-medium hover:bg-transparent"
          >
            <Link href="/events" prefetch={false}>
              すべて表示 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {events === null ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <p className="text-[13px] font-semibold text-muted-foreground">
              データの取得に失敗しました
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/5 border border-primary/10 mb-5">
              <Calendar className="h-6 w-6 text-primary/70" />
            </div>
            <p className="text-[15px] font-semibold text-foreground mb-1.5">
              イベントがまだありません
            </p>
            <p className="text-[13px] text-muted-foreground mb-6 max-w-[220px]">
              新しいイベントを作成して集金を開始しましょう
            </p>
            <Button
              asChild
              size="default"
              className="rounded-xl font-bold px-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
            >
              <Link href="/events/create" prefetch={false}>
                はじめてのイベントを作成
              </Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {events.map((event) => (
              <DashboardRecentEventItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
