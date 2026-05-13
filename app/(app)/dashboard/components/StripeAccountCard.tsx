import Link from "next/link";

import { ArrowRight, Landmark } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { DashboardDataResource } from "../_lib/dashboard-data";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

export async function StripeAccountCard({
  dashboardDataResource,
}: {
  dashboardDataResource: Promise<DashboardDataResource>;
}) {
  let balance: number | null = null;

  try {
    const { stripeBalance } = await dashboardDataResource;
    balance = await stripeBalance;
  } catch {
    balance = null;
  }

  return (
    <Link href="/settings/payments" className="group block focus-visible:outline-none">
      <Card className="relative overflow-hidden border-0 bg-green-50/30 shadow-sm transition-colors group-hover:bg-green-50/60 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
        <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-green-100 p-2">
              <Landmark className="h-4 w-4 text-green-600" />
            </div>
            <CardTitle className="text-sm font-semibold text-gray-700">残高</CardTitle>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-green-700/40 transition-transform group-hover:translate-x-0.5 group-hover:text-green-700/70 motion-reduce:transition-none" />
        </CardHeader>
        <CardContent className="relative pt-0">
          <div className="text-xl font-bold leading-tight text-gray-900">
            {balance === null ? (
              <span className="text-lg text-muted-foreground">-</span>
            ) : (
              formatCurrency(balance)
            )}
          </div>
          <div className="mt-2 text-xs text-gray-500">オンライン集金を管理</div>
        </CardContent>
      </Card>
    </Link>
  );
}
