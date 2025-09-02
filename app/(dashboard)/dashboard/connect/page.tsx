/**
 * Stripe Connect 設定ページ
 */

import { Suspense } from "react";

import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { CONNECT_REFRESH_PATH, CONNECT_RETURN_PATH } from "@core/routes/stripe-connect";
import { createClient } from "@core/supabase/server";

import { AccountStatus } from "@features/stripe-connect/components/account-status";
import { OnboardingForm } from "@features/stripe-connect/components/onboarding-form";
import { createUserStripeConnectService } from "@features/stripe-connect/services";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Stripe Connect 設定 | EventPay",
  description: "売上受取用のStripe Connectアカウントを設定します",
};

interface ConnectPageProps {
  searchParams: {
    refresh?: string;
  };
}

async function ConnectContent({ searchParams }: ConnectPageProps) {
  const supabase = createClient();

  // 認証チェック
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  // StripeConnectServiceを初期化（ユーザーセッション使用、RLS適用）
  const stripeConnectService = createUserStripeConnectService();

  // 既存のアカウントをチェック
  const existingAccount = await stripeConnectService.getConnectAccountByUser(user.id);

  // リダイレクトURL設定
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const refreshUrl = `${baseUrl}${CONNECT_REFRESH_PATH}`;
  const returnUrl = `${baseUrl}${CONNECT_RETURN_PATH}`;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">売上受取設定</h1>
          <p className="text-muted-foreground">
            イベントの売上を受け取るためのStripe Connectアカウントを設定します
          </p>
        </div>

        {/* リフレッシュメッセージ */}
        {searchParams.refresh && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 text-sm">
              設定を続行するには、下記のボタンから再度設定を開始してください。
            </p>
          </div>
        )}

        {/* アカウントが存在しない場合はオンボーディングフォーム */}
        {!existingAccount ? (
          <OnboardingForm refreshUrl={refreshUrl} returnUrl={returnUrl} />
        ) : (
          <AccountStatus refreshUrl={refreshUrl} returnUrl={returnUrl} />
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-96 mx-auto" />
        </div>
        <Card className="w-full max-w-2xl mx-auto">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 border rounded-lg space-y-2">
                  <Skeleton className="h-8 w-8 mx-auto" />
                  <Skeleton className="h-4 w-20 mx-auto" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ConnectPage(props: ConnectPageProps) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ConnectContent {...props} />
    </Suspense>
  );
}
