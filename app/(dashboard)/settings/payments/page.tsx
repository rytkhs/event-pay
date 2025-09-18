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
          <CardTitle>支払い設定</CardTitle>
          <CardDescription>Stripe Connectアカウントの管理と支払い受け取り設定</CardDescription>
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
