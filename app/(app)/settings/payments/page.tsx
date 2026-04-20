import { Suspense } from "react";

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
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "オンライン集金設定",
  description: "オンライン集金の受け取り方法を設定します",
};

async function PaymentSettingsContent() {
  const workspace = await requireNonEmptyCommunityWorkspaceForServerComponent();
  const currentCommunity = workspace.currentCommunity;

  if (!currentCommunity) {
    return null;
  }

  const stripeConnectService = await createUserStripeConnectServiceForServerComponent();

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
    description: community.description ?? null,
    id: community.id,
    name: community.name,
    slug: community.slug,
    publicPageUrl: getPublicUrl(`/c/${community.slug}`),
  }));

  const refreshUrl = CONNECT_REFRESH_PATH;

  if (requiresRepresentativeSelection) {
    return (
      <OnboardingForm
        communities={representativeCommunityOptions}
        defaultRepresentativeCommunityId={currentCommunity.id}
        hasExistingAccount={!!existingAccount}
        onStartOnboarding={startOnboardingAction}
      />
    );
  }

  return (
    <AccountStatus
      refreshUrl={refreshUrl}
      status={await (async () => {
        const r = await getConnectAccountStatusAction();

        if (!r.success) {
          const cachedStatus = buildConnectAccountStatusPayloadFromCachedAccount(existingAccount);
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
          collectionReady: r.data?.collectionReady ?? false,
          payoutsEnabled: r.data?.payoutsEnabled ?? false,
          requirementsSummary: r.data?.requirementsSummary,
          requirements: r.data?.requirements,
          capabilities: r.data?.capabilities,
          expressDashboardAvailable: expressAccess.success && !!expressAccess.data?.hasAccount,
        };
      })()}
      expressDashboardAction={createExpressDashboardLoginLinkAction}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      {/* ヒーロー部分 */}
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-14 w-14 rounded-2xl" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* メリットグリッド */}
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      {/* CTA */}
      <Skeleton className="h-12 w-full rounded-md" />
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
