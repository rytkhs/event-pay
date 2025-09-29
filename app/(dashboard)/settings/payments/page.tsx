import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

import { getDetailedAccountStatusAction } from "@features/stripe-connect/actions/account-status-check";
import { ConnectAccountCta } from "@features/stripe-connect/components/connect-account-cta";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PaymentSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // Stripe Connect アカウント状況を取得
  const { success, status } = await getDetailedAccountStatusAction();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Stripe Connect アカウント</CardTitle>
          <CardDescription>
            決済受け取りのためのStripe Connectアカウントを管理します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {success && status ? (
            <ConnectAccountCta status={status} />
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">支払い設定を読み込み中...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
