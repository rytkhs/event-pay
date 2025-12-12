import { Suspense } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import { Plus } from "lucide-react";

import { createClient } from "@core/supabase/server";

import { Button } from "@/components/ui/button";

import { ConnectAccountCtaWrapper } from "./components/connect-account-cta-wrapper";
import { DashboardStatsCards } from "./components/dashboard-stats-cards";
import { RecentEventsList } from "./components/recent-events-list";
import {
  DashboardStatsSkeleton,
  StripeAccountSkeleton,
  RecentEventsSkeleton,
  ConnectAccountCtaSkeleton,
} from "./components/skeletons";
import { StripeAccountCard } from "./components/stripe-account-card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // 認証状態チェック
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?redirectTo=/dashboard");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto py-4 sm:py-6 lg:py-8 px-3 sm:px-4 lg:px-8">
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
            <DashboardStatsCards />
          </Suspense>
          <Suspense fallback={<StripeAccountSkeleton />}>
            <StripeAccountCard />
          </Suspense>
        </div>

        {/* Stripe Connect アカウント設定CTA */}
        <Suspense fallback={<ConnectAccountCtaSkeleton />}>
          <ConnectAccountCtaWrapper />
        </Suspense>

        {/* 最近のイベント（全幅版） */}
        <Suspense fallback={<RecentEventsSkeleton />}>
          <RecentEventsList />
        </Suspense>

        {/* フローティングアクションボタン（FAB） - モバイル専用 */}
        <div className="fixed bottom-6 right-4 z-50 sm:hidden">
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
