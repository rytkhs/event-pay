import { Suspense } from "react";

import { redirect } from "next/navigation";

import { resolveAppWorkspaceForServerComponent } from "@core/community/app-workspace";

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
  const workspace = await resolveAppWorkspaceForServerComponent();

  if (workspace.isCommunityEmptyState) {
    redirect("/communities/create");
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
    <div className="bg-muted/30">
      <div className="max-w-7xl mx-auto sm:py-6 lg:py-8 sm:px-4 lg:px-8">
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
