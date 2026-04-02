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

import { resolveCurrentCommunityPayoutProfile } from "./payout-profile-resolver";

type DashboardPayoutProfileRow = Pick<
  PayoutProfileRow,
  "representative_community_id" | "status" | "payouts_enabled" | "stripe_account_id"
>;

export function resolveDashboardConnectCtaStatus(
  account: DashboardPayoutProfileRow | null
): DetailedAccountStatus | undefined {
  if (!account) {
    return NO_ACCOUNT_STATUS;
  }

  if (!account.representative_community_id) {
    return DASHBOARD_SETUP_INCOMPLETE_STATUS;
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
  _userId: string,
  communityId: string
): Promise<DashboardPayoutProfileRow | null> {
  const { payoutProfile } = await resolveCurrentCommunityPayoutProfile(supabase, {
    communityId,
  });

  if (!payoutProfile) {
    return null;
  }

  return {
    representative_community_id: payoutProfile.representative_community_id,
    payouts_enabled: payoutProfile.payouts_enabled,
    status: payoutProfile.status,
    stripe_account_id: payoutProfile.stripe_account_id,
  };
}

export async function getDashboardConnectCtaStatus(
  supabase: AppSupabaseClient,
  userId: string,
  communityId: string
): Promise<DetailedAccountStatus | undefined> {
  const account = await getDashboardPayoutProfile(supabase, userId, communityId);
  return resolveDashboardConnectCtaStatus(account);
}

export async function getDashboardConnectBalance(
  supabase: AppSupabaseClient,
  userId: string,
  communityId: string
): Promise<number | null> {
  const account = await getDashboardPayoutProfile(supabase, userId, communityId);

  if (!account) {
    return null;
  }

  return await fetchStripeBalanceByAccountId(account.stripe_account_id);
}
