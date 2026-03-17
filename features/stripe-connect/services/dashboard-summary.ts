import "server-only";

import type { PayoutProfileRow } from "@core/types/payout-profile";
import type { AppSupabaseClient } from "@core/types/supabase";

import { fetchStripeBalanceByAccountId } from "../actions/get-balance";
import {
  DASHBOARD_SETUP_INCOMPLETE_STATUS,
  NO_ACCOUNT_STATUS,
  RESTRICTED_STATUS,
  UNVERIFIED_STATUS,
} from "../constants/detailed-account-status";
import type { DetailedAccountStatus } from "../types";

type DashboardPayoutProfileRow = Pick<
  PayoutProfileRow,
  "status" | "payouts_enabled" | "stripe_account_id"
>;

export function resolveDashboardConnectCtaStatus(
  account: DashboardPayoutProfileRow | null
): DetailedAccountStatus | undefined {
  if (!account) {
    return NO_ACCOUNT_STATUS;
  }

  switch (account.status) {
    case "restricted":
      return RESTRICTED_STATUS;
    case "unverified":
      return UNVERIFIED_STATUS;
    case "verified":
      return account.payouts_enabled ? undefined : DASHBOARD_SETUP_INCOMPLETE_STATUS;
    case "onboarding":
    default:
      return DASHBOARD_SETUP_INCOMPLETE_STATUS;
  }
}

async function getDashboardPayoutProfile(
  supabase: AppSupabaseClient,
  communityId: string
): Promise<DashboardPayoutProfileRow | null> {
  const { data, error } = await supabase
    .from("communities")
    .select("current_payout_profile_id")
    .eq("id", communityId)
    .maybeSingle<{ current_payout_profile_id: string | null }>();

  if (error) {
    throw error;
  }

  const payoutProfileId = data?.current_payout_profile_id ?? null;

  if (!payoutProfileId) {
    return null;
  }

  const { data: payoutProfile, error: payoutProfileError } = await supabase
    .from("payout_profiles")
    .select("status, payouts_enabled, stripe_account_id")
    .eq("id", payoutProfileId)
    .maybeSingle<DashboardPayoutProfileRow>();

  if (payoutProfileError) {
    throw payoutProfileError;
  }

  return payoutProfile;
}

export async function getDashboardConnectCtaStatus(
  supabase: AppSupabaseClient,
  communityId: string
): Promise<DetailedAccountStatus | undefined> {
  const account = await getDashboardPayoutProfile(supabase, communityId);
  return resolveDashboardConnectCtaStatus(account);
}

export async function getDashboardConnectBalance(
  supabase: AppSupabaseClient,
  communityId: string
): Promise<number | null> {
  const account = await getDashboardPayoutProfile(supabase, communityId);

  if (!account) {
    return null;
  }

  return await fetchStripeBalanceByAccountId(account.stripe_account_id);
}
