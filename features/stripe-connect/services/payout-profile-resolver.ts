import "server-only";

import type { PayoutProfileRow } from "@core/types/payout-profile";
import type { AppSupabaseClient } from "@core/types/supabase";

type StripeConnectPayoutProfile = Pick<
  PayoutProfileRow,
  | "id"
  | "owner_user_id"
  | "stripe_account_id"
  | "status"
  | "collection_ready"
  | "payouts_enabled"
  | "representative_community_id"
  | "requirements_disabled_reason"
  | "requirements_summary"
  | "stripe_status_synced_at"
  | "transfers_status"
  | "created_at"
  | "updated_at"
>;

type CurrentCommunityPayoutProfileResolution = {
  payoutProfile: StripeConnectPayoutProfile | null;
  resolvedBy: "community" | "none";
};

const PAYOUT_PROFILE_SELECT = [
  "id",
  "owner_user_id",
  "stripe_account_id",
  "status",
  "collection_ready",
  "payouts_enabled",
  "representative_community_id",
  "requirements_disabled_reason",
  "requirements_summary",
  "stripe_status_synced_at",
  "transfers_status",
  "created_at",
  "updated_at",
].join(", ");

export async function getOwnerPayoutProfile(
  supabase: AppSupabaseClient,
  userId: string
): Promise<StripeConnectPayoutProfile | null> {
  const { data, error } = await supabase
    .from("payout_profiles")
    .select(PAYOUT_PROFILE_SELECT)
    .eq("owner_user_id", userId)
    .maybeSingle<StripeConnectPayoutProfile>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function getPayoutProfileById(
  supabase: AppSupabaseClient,
  payoutProfileId: string
): Promise<StripeConnectPayoutProfile | null> {
  const { data, error } = await supabase
    .from("payout_profiles")
    .select(PAYOUT_PROFILE_SELECT)
    .eq("id", payoutProfileId)
    .maybeSingle<StripeConnectPayoutProfile>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function getPayoutProfileByStripeAccountId(
  supabase: AppSupabaseClient,
  stripeAccountId: string
): Promise<StripeConnectPayoutProfile | null> {
  const { data, error } = await supabase
    .from("payout_profiles")
    .select(PAYOUT_PROFILE_SELECT)
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle<StripeConnectPayoutProfile>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function resolveCurrentCommunityPayoutProfile(
  supabase: AppSupabaseClient,
  params: {
    communityId: string;
  }
): Promise<CurrentCommunityPayoutProfileResolution> {
  const { communityId } = params;
  const { data, error } = await supabase
    .from("communities")
    .select("current_payout_profile_id")
    .eq("id", communityId)
    .maybeSingle<{ current_payout_profile_id: string | null }>();

  if (error) {
    throw error;
  }

  const payoutProfileId = data?.current_payout_profile_id ?? null;
  if (payoutProfileId) {
    const payoutProfile = await getPayoutProfileById(supabase, payoutProfileId);
    if (payoutProfile) {
      return {
        payoutProfile,
        resolvedBy: "community",
      };
    }
  }

  return {
    payoutProfile: null,
    resolvedBy: "none",
  };
}

export async function syncOwnerPayoutProfileToCommunities(
  supabase: AppSupabaseClient,
  params: {
    payoutProfileId: string;
    userId: string;
  }
): Promise<void> {
  const { payoutProfileId, userId } = params;

  const { error } = await supabase
    .from("communities")
    .update({
      current_payout_profile_id: payoutProfileId,
    })
    .eq("created_by", userId)
    .eq("is_deleted", false)
    .or(`current_payout_profile_id.is.null,current_payout_profile_id.neq.${payoutProfileId}`);

  if (error) {
    throw error;
  }
}
