import "server-only";

import type { AppSupabaseClient } from "@core/types/supabase";

import { getEventPayoutProfileReadiness } from "./payout-profile-readiness";

type CommunityPayoutSnapshotRow = {
  current_payout_profile_id: string | null;
};

export type EventStripePayoutProfileResolution = {
  isReady: boolean;
  payoutProfileId: string | null;
  shouldBackfillEventSnapshot: boolean;
  userMessage?: string;
};

export async function resolveEventStripePayoutProfile(
  supabase: AppSupabaseClient<"public">,
  params: {
    currentCommunityId: string;
    eventPayoutProfileId: string | null;
  }
): Promise<EventStripePayoutProfileResolution> {
  const { currentCommunityId, eventPayoutProfileId } = params;

  // events.payout_profile_id は一度設定されると固定され、NULL のイベントのみ、Stripe が初めて有効化された際に現在のコミュニティからバックフィルされる
  if (eventPayoutProfileId) {
    const readiness = await getEventPayoutProfileReadiness(supabase, eventPayoutProfileId);

    return {
      ...readiness,
      payoutProfileId: eventPayoutProfileId,
      shouldBackfillEventSnapshot: false,
    };
  }

  const { data, error } = await supabase
    .from("communities")
    .select("current_payout_profile_id")
    .eq("id", currentCommunityId)
    .maybeSingle<CommunityPayoutSnapshotRow>();

  if (error) {
    throw error;
  }

  const payoutProfileId = data?.current_payout_profile_id ?? null;
  const readiness = await getEventPayoutProfileReadiness(supabase, payoutProfileId);

  return {
    ...readiness,
    payoutProfileId,
    shouldBackfillEventSnapshot: readiness.isReady && payoutProfileId !== null,
  };
}
