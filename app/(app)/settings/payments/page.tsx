import { Suspense } from "react";

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

import { CONNECT_REFRESH_PATH } from "@core/routes/stripe-connect";
import { createClient } from "@core/supabase/server";

import { AccountStatus, OnboardingForm } from "@features/stripe-connect";
import {
  checkExpressDashboardAccessAction,
  createUserStripeConnectService,
  getConnectAccountStatusAction,
} from "@features/stripe-connect/server";

import {
  createExpressDashboardLoginLinkAction,
  startOnboardingAction,
} from "@/app/_actions/stripe-connect/actions";
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
  const refreshUrl = CONNECT_REFRESH_PATH;

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
        <OnboardingForm onStartOnboarding={startOnboardingAction} />
      ) : (
        <AccountStatus
          refreshUrl={refreshUrl}
          status={await (async () => {
            const r = await getConnectAccountStatusAction();
            const expressAccess = await checkExpressDashboardAccessAction();

            if (!r.success) {
              return {
                hasAccount: false,
                uiStatus: "no_account" as const,
                chargesEnabled: false,
                payoutsEnabled: false,
                expressDashboardAvailable: false,
              };
            }

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
              expressDashboardAvailable: expressAccess.success && !!expressAccess.data?.hasAccount,
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
