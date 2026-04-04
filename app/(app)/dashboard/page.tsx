import { Suspense } from "react";

import Link from "next/link";

import { Plus } from "lucide-react";

import { resolveAppWorkspaceForServerComponent } from "@core/community/app-workspace";

import { Button } from "@/components/ui/button";

import { createDashboardDataResource } from "./_lib/dashboard-data";
import { CommunityEmptyState } from "./components/CommunityEmptyState";
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
  const workspace = await resolveAppWorkspaceForServerComponent();

  if (workspace.isCommunityEmptyState) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="max-w-7xl mx-auto sm:py-6 lg:py-8 sm:px-4 lg:px-8">
          <div className="flex flex-col gap-2 mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ホーム</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              コミュニティ作成後に、ここから運営状況を確認できます
            </p>
          </div>
          <CommunityEmptyState />
        </div>
      </div>
    );
  }

  const currentCommunity = workspace.currentCommunity;

  if (!currentCommunity) {
    return null;
  }

  const dashboardDataResource = createDashboardDataResource(
    workspace.currentUser.id,
    currentCommunity.id
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto sm:py-6 lg:py-8 sm:px-4 lg:px-8">
        {/* ホームヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ホーム</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              {currentCommunity.name} の運営状況を確認できます
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="default" className="hidden sm:flex w-fit items-center gap-2">
              <Link href="/events/create">
                <Plus className="h-4 w-4" />
                新しいイベント
              </Link>
            </Button>
          </div>
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
      </div>
    </div>
  );
}
