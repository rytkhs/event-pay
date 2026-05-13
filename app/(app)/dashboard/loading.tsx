import {
  ConnectAccountCtaSkeleton,
  DashboardStatsSkeleton,
  RecentEventsSkeleton,
  StripeAccountSkeleton,
} from "./components/Skeletons";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto sm:py-6 lg:py-8 sm:px-4 lg:px-8">
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
