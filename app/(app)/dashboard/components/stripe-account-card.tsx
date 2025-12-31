import { Landmark } from "lucide-react";

import { getStripeBalanceAction } from "@features/stripe-connect";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

export async function StripeAccountCard() {
  const balanceResult = await getStripeBalanceAction();
  const balance = balanceResult.success ? balanceResult.data : 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
          アカウント残高
        </CardTitle>
        <Landmark className="h-4 w-4 sm:h-5 sm:w-5 text-success flex-shrink-0" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-lg sm:text-2xl lg:text-3xl font-bold text-success leading-tight">
          {formatCurrency(balance)}
        </div>
      </CardContent>
    </Card>
  );
}
