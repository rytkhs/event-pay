import { Suspense } from "react";

import Link from "next/link";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { requireNonEmptyCommunityWorkspaceForServerComponent } from "@core/community/app-workspace";
import { getPublicUrl } from "@core/seo/metadata";

import { AccountStatus, CONNECT_REFRESH_PATH, OnboardingForm } from "@features/stripe-connect";
import {
  buildConnectAccountStatusPayloadFromCachedAccount,
  checkExpressDashboardAccessAction,
  createUserStripeConnectServiceForServerComponent,
  getConnectAccountStatusAction,
} from "@features/stripe-connect/server";

import {
  createExpressDashboardLoginLinkAction,
  startOnboardingAction,
} from "@/app/_actions/stripe-connect/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Stripe アカウント設定",
  description: "Stripeで売上の受け取り方法を設定します",
};

async function PaymentSettingsContent() {
  const workspace = await requireNonEmptyCommunityWorkspaceForServerComponent();
  const currentCommunity = workspace.currentCommunity;

  if (!currentCommunity) {
    return null;
  }

  // StripeConnectServiceを初期化
  const stripeConnectService = await createUserStripeConnectServiceForServerComponent();

  // 既存のアカウントをチェック
  const existingAccount = await stripeConnectService.getConnectAccountForCommunity(
    workspace.currentUser.id,
    currentCommunity.id
  );
  const representativeCommunity = existingAccount?.representative_community_id
    ? (workspace.ownedCommunities.find(
        (community) => community.id === existingAccount.representative_community_id
      ) ?? null)
    : null;
  const requiresRepresentativeSelection = !existingAccount || !representativeCommunity;
  const representativeCommunityOptions = workspace.ownedCommunities.map((community) => ({
    id: community.id,
    name: community.name,
    slug: community.slug,
    publicPageUrl: getPublicUrl(`/c/${community.slug}`),
  }));

  // リダイレクトURL設定
  const refreshUrl = CONNECT_REFRESH_PATH;

  return (
    <div className="space-y-6">
      <div className="bg-muted/40 border border-muted/60 rounded-lg p-4 text-sm text-muted-foreground space-y-1">
        <p className="text-muted-foreground">
          オンライン集金を有効化するために、Stripe アカウントの設定を行います。
        </p>
        <p>
          入力内容は Stripe に直接送信され、当サービスではカード情報や身分証の画像を保持しません。
        </p>
      </div>

      {representativeCommunity ? (
        <div className="rounded-lg border border-border/70 bg-background p-4 text-sm">
          <p className="font-medium text-foreground">Stripe 設定で使う代表コミュニティページ</p>
          <div className="mt-2 flex flex-col gap-1">
            <span className="text-muted-foreground">{representativeCommunity.name}</span>
            <Link
              href={getPublicUrl(`/c/${representativeCommunity.slug}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 text-primary hover:underline"
            >
              {getPublicUrl(`/c/${representativeCommunity.slug}`)}
            </Link>
          </div>
        </div>
      ) : null}

      {requiresRepresentativeSelection ? (
        <OnboardingForm
          communities={representativeCommunityOptions}
          defaultRepresentativeCommunityId={currentCommunity.id}
          hasExistingAccount={!!existingAccount}
          onStartOnboarding={startOnboardingAction}
        />
      ) : (
        <AccountStatus
          refreshUrl={refreshUrl}
          status={await (async () => {
            const r = await getConnectAccountStatusAction();

            if (!r.success) {
              const cachedStatus =
                buildConnectAccountStatusPayloadFromCachedAccount(existingAccount);
              return {
                ...cachedStatus,
                expressDashboardAvailable: false,
              };
            }

            const expressAccess = await checkExpressDashboardAccessAction();

            return {
              hasAccount: true,
              accountId: r.data?.accountId,
              dbStatus: r.data?.dbStatus,
              uiStatus: r.data?.uiStatus ?? "no_account",
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

export default async function PaymentSettingsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <PaymentSettingsContent />
    </Suspense>
  );
}
