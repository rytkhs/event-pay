export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { requireNonEmptyCommunityWorkspaceForServerComponent } from "@core/community/app-workspace";
import { resolvePlatformFeeConfigForNewEventApplicationFee } from "@core/stripe/fee-config/application-fee-config-resolver";
import { FeeConfigService, type PlatformFeeConfig } from "@core/stripe/fee-config/service";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";
import type { AppSupabaseClient } from "@core/types/supabase";

import { SinglePageEventForm } from "@features/events";
import { resolveEventStripePayoutProfile } from "@features/events/server";
import { getDashboardConnectCtaStatus } from "@features/stripe-connect/server";

import { createEventAction } from "./actions";

async function resolveFeeEstimateConfig(
  supabase: AppSupabaseClient<"public">,
  ownerUserId: string
): Promise<PlatformFeeConfig | null> {
  try {
    const { platform } = await new FeeConfigService(supabase).getConfig();
    const resolution = await resolvePlatformFeeConfigForNewEventApplicationFee(supabase, platform, {
      ownerUserId,
    });

    return resolution.platform;
  } catch {
    return null;
  }
}

export default async function CreateEventPage() {
  const workspace = await requireNonEmptyCommunityWorkspaceForServerComponent();
  const currentCommunity = workspace.currentCommunity;

  if (!currentCommunity) {
    return notFound();
  }

  // current community の payout profile 状態から、オンライン決済可否を決定する
  const supabase = await createServerComponentSupabaseClient();
  const [connectStatus, payoutResolution, feeEstimateConfig] = await Promise.all([
    getDashboardConnectCtaStatus(supabase, workspace.currentUser.id, currentCommunity.id),
    resolveEventStripePayoutProfile(supabase, {
      currentCommunityId: currentCommunity.id,
      eventPayoutProfileId: null,
    }),
    resolveFeeEstimateConfig(supabase, workspace.currentUser.id),
  ]);
  const canUseOnlinePayments = payoutResolution.isReady;

  return (
    <div className="min-h-screen">
      <SinglePageEventForm
        canUseOnlinePayments={canUseOnlinePayments}
        connectStatus={connectStatus}
        currentCommunityName={currentCommunity.name}
        createEventAction={createEventAction}
        feeEstimateConfig={feeEstimateConfig}
      />
    </div>
  );
}
