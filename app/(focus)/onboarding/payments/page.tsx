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
    <main className="min-h-screen bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.35)_48%,hsl(var(--background))_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            みんなの集金
          </span>
          <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">
            2 / 2
          </span>
        </header>

        <div className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <div className="w-full">
            <section className="mx-auto mb-10 max-w-2xl text-center">
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                コミュニティを作成しました
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
                オンライン集金を設定すると、参加費をStripe経由で受け取れます。
                現金集金だけで始める場合は、あとから設定できます。
              </p>
            </section>

            <OnboardingForm
              communities={representativeCommunityOptions}
              defaultRepresentativeCommunityId={currentCommunity.id}
              hasExistingAccount={!!existingAccount}
              onStartOnboarding={startOnboardingAction}
              secondaryAction={
                <Button asChild variant="outline" className="h-11 w-full">
                  <Link href="/dashboard">あとで設定する</Link>
                </Button>
              }
            />
          </div>
        </div>
      </div>
    </main>
  );
}
