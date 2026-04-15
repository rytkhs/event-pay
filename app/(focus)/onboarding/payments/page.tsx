import Link from "next/link";
import { redirect } from "next/navigation";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { resolveAppWorkspaceForServerComponent } from "@core/community/app-workspace";
import { getPublicUrl } from "@core/seo/metadata";

import { OnboardingForm } from "@features/stripe-connect";
import { createUserStripeConnectServiceForServerComponent } from "@features/stripe-connect/server";

import { startOnboardingAction } from "@/app/_actions/stripe-connect/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "オンライン集金設定",
  description: "オンライン集金の受け取り方法を設定します",
};

export default async function OnboardingPaymentsPage() {
  const workspace = await resolveAppWorkspaceForServerComponent();
  const currentCommunity = workspace.currentCommunity;

  if (!currentCommunity) {
    redirect("/communities/create");
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

  if (existingAccount && representativeCommunity) {
    redirect("/settings/payments");
  }

  const representativeCommunityOptions = workspace.ownedCommunities.map((community) => ({
    id: community.id,
    name: community.name,
    slug: community.slug,
    publicPageUrl: getPublicUrl(`/c/${community.slug}`),
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.4)_48%,hsl(var(--background))_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
              みんなの集金
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] font-medium text-muted-foreground/60 sm:block">
              セットアップ
            </span>
            <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-bold text-foreground/80 shadow-sm backdrop-blur-sm">
              2 / 2
            </span>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <div className="w-full">
            <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center">
              {/* 成功バッジ */}
              {/* <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[13px] font-medium text-emerald-600 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                コミュニティを作成しました
              </div> */}

              <OnboardingForm
                communities={representativeCommunityOptions}
                defaultRepresentativeCommunityId={currentCommunity.id}
                hasExistingAccount={!!existingAccount}
                onStartOnboarding={startOnboardingAction}
                secondaryAction={
                  <Button
                    asChild
                    variant="ghost"
                    className="h-11 w-full text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/dashboard">今は設定せずにダッシュボードへ</Link>
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
