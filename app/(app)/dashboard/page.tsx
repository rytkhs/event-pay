import { Suspense } from "react";

import Link from "next/link";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { createDashboardDataResource } from "./_lib/dashboard-data";
import { ConnectAccountCtaWrapper } from "./components/ConnectAccountCtaWrapper";
import { DashboardStatsCards } from "./components/DashboardStatsCards";
import { RecentEventsList } from "./components/RecentEventsList";
import {
  DashboardStatsSkeleton,
  StripeAccountSkeleton,
  RecentEventsSkeleton,
  ConnectAccountCtaSkeleton,
} from "./components/Skeletons";
import { StripeAccountCard } from "./components/StripeAccountCard";

export default async function DashboardPage() {
  const dashboardDataResource = createDashboardDataResource();

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto sm:py-6 lg:py-8 sm:px-4 lg:px-8 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-0">
        {/* ダッシュボードヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ダッシュボード</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              イベント管理の概要を確認できます
            </p>
          </div>
          <Button asChild size="default" className="hidden sm:flex w-fit items-center gap-2">
            <Link href="/events/create">
              <Plus className="h-4 w-4" />
              新しいイベント
            </Link>
          </Button>
        </div>

        {/* 統計カードセクション（4つのカード） */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Suspense fallback={<DashboardStatsSkeleton />}>
            <DashboardStatsCards dashboardDataResource={dashboardDataResource} />
          </Suspense>
          <Suspense fallback={<StripeAccountSkeleton />}>
            <StripeAccountCard dashboardDataResource={dashboardDataResource} />
          </Suspense>
        </div>

        {/* Stripe Connect アカウント設定CTA */}
        <Suspense fallback={<ConnectAccountCtaSkeleton />}>
          <ConnectAccountCtaWrapper dashboardDataResource={dashboardDataResource} />
        </Suspense>

        {/* 最近のイベント（全幅版） */}
        <Suspense fallback={<RecentEventsSkeleton />}>
          <RecentEventsList dashboardDataResource={dashboardDataResource} />
        </Suspense>

        {/* フローティングアクションボタン（FAB） - モバイル専用 */}
        <div className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50 sm:hidden">
          <Button
            asChild
            size="lg"
            className="rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Link href="/events/create" className="flex items-center justify-center">
              <Plus className="h-6 w-6" />
              <span className="sr-only">新規イベント作成</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
