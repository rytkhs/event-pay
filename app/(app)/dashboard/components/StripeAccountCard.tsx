import { Landmark } from "lucide-react";

import { getStripeBalanceAction } from "@features/stripe-connect/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

export async function StripeAccountCard() {
  const balanceResult = await getStripeBalanceAction();
  const balance = balanceResult.success ? (balanceResult.data ?? 0) : 0;

  return (
    <Card className="relative overflow-hidden border-0 bg-green-50/30 shadow-sm">
      <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-green-100 p-2">
            <Landmark className="h-4 w-4 text-green-600" />
          </div>
          <CardTitle className="text-sm font-semibold text-gray-700">残高</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="relative pt-0">
        <div className="text-xl font-bold text-gray-900 leading-tight">
          {formatCurrency(balance)}
        </div>
        <div className="mt-2 text-xs text-gray-500">Stripe残高</div>
      </CardContent>
    </Card>
  );
}
