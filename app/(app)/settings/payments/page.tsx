import { Suspense } from "react";

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

import { CONNECT_REFRESH_PATH } from "@core/routes/stripe-connect";
import { createClient } from "@core/supabase/server";

import {
  AccountStatus,
  OnboardingForm,
  createUserStripeConnectService,
  startOnboardingAction,
  getConnectAccountStatusAction,
  checkExpressDashboardAccessAction,
  createExpressDashboardLoginLinkAction,
} from "@features/stripe-connect";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

async function PaymentSettingsContent() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // StripeConnectServiceを初期化
  const stripeConnectService = createUserStripeConnectService();

  // 既存のアカウントをチェック
  const existingAccount = await stripeConnectService.getConnectAccountByUser(user.id);

  // リダイレクトURL設定
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const refreshUrl = `${baseUrl}${CONNECT_REFRESH_PATH}`;
  const returnUrl = `${baseUrl}/settings/payments`; // 設定ページに戻る

  return (
    <div className="space-y-6">
      <div className="bg-muted/40 border border-muted/60 rounded-lg p-4 text-sm text-muted-foreground space-y-1">
        <p className="text-muted-foreground">
          売上を受け取るために、Stripeの設定画面で入金設定を行います。
        </p>
        <p>
          入力内容はStripeに直接送信され、当サービスではカード情報や身分証の画像を保持しません。
        </p>
      </div>

      {/* アカウントが存在しない場合はオンボーディングフォーム */}
      {!existingAccount ? (
        <OnboardingForm
          refreshUrl={refreshUrl}
          returnUrl={returnUrl}
          onStartOnboarding={startOnboardingAction}
        />
      ) : (
        <AccountStatus
          refreshUrl={refreshUrl}
          status={await (async () => {
            const r = await getConnectAccountStatusAction();
            const expressAccess = await checkExpressDashboardAccessAction();
            return {
              hasAccount: true,
              accountId: r.data?.accountId,
              dbStatus: r.data?.dbStatus as
                | "unverified"
                | "onboarding"
                | "verified"
                | "restricted"
                | undefined,
              uiStatus: (r.data?.uiStatus ?? "no_account") as
                | "no_account"
                | "unverified"
                | "requirements_due"
                | "ready"
                | "restricted",
              chargesEnabled: r.data?.chargesEnabled ?? false,
              payoutsEnabled: r.data?.payoutsEnabled ?? false,
              requirements: r.data?.requirements,
              capabilities: r.data?.capabilities,
              expressDashboardAvailable: expressAccess.success,
            };
          })()}
          expressDashboardAction={createExpressDashboardLoginLinkAction}
        />
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Stripeアカウント</CardTitle>
          <CardDescription>決済受け取りのためのStripeアカウントを管理します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-3/4" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentSettingsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <PaymentSettingsContent />
    </Suspense>
  );
}
