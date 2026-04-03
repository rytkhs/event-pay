import Link from "next/link";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  ConnectAccountCtaSkeleton,
  DashboardStatsSkeleton,
  RecentEventsSkeleton,
  StripeAccountSkeleton,
} from "./components/Skeletons";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto sm:py-6 lg:py-8 sm:px-4 lg:px-8">
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <DashboardStatsSkeleton />
          <StripeAccountSkeleton />
        </div>

        <ConnectAccountCtaSkeleton />
        <RecentEventsSkeleton />
      </div>
    </div>
  );
}
