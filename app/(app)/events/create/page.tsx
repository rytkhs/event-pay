export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { requireNonEmptyCommunityWorkspaceForServerComponent } from "@core/community/app-workspace";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { SinglePageEventForm } from "@features/events";
import { resolveEventStripePayoutProfile } from "@features/events/server";
import { getDashboardConnectCtaStatus } from "@features/stripe-connect/server";

import { createEventAction } from "./actions";

export default async function CreateEventPage() {
  const workspace = await requireNonEmptyCommunityWorkspaceForServerComponent();
  const currentCommunity = workspace.currentCommunity;

  if (!currentCommunity) {
    return notFound();
  }

  // current community の payout profile 状態から、オンライン決済可否を決定する
  const supabase = await createServerComponentSupabaseClient();
  const [connectStatus, payoutResolution] = await Promise.all([
    getDashboardConnectCtaStatus(supabase, workspace.currentUser.id, currentCommunity.id),
    resolveEventStripePayoutProfile(supabase, {
      currentCommunityId: currentCommunity.id,
      eventPayoutProfileId: null,
    }),
  ]);
  const canUseOnlinePayments = payoutResolution.isReady;

  return (
    <div className="min-h-screen">
      <SinglePageEventForm
        canUseOnlinePayments={canUseOnlinePayments}
        connectStatus={connectStatus}
        currentCommunityName={currentCommunity.name}
        createEventAction={createEventAction}
      />
    </div>
  );
}
