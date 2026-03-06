import "server-only";

import type { StripeConnectAccountRow } from "@core/types/stripe-connect";
import type { AppSupabaseClient } from "@core/types/supabase";

import { fetchStripeBalanceByAccountId } from "../actions/get-balance";
import {
  DASHBOARD_SETUP_INCOMPLETE_STATUS,
  NO_ACCOUNT_STATUS,
  RESTRICTED_STATUS,
  UNVERIFIED_STATUS,
} from "../constants/detailed-account-status";
import type { DetailedAccountStatus } from "../types";

type DashboardConnectAccountRow = Pick<
  StripeConnectAccountRow,
  "status" | "payouts_enabled" | "stripe_account_id"
>;

export function resolveDashboardConnectCtaStatus(
  account: DashboardConnectAccountRow | null
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

async function getDashboardConnectAccount(
  supabase: AppSupabaseClient,
  userId: string
): Promise<DashboardConnectAccountRow | null> {
  const { data, error } = await supabase
    .from("stripe_connect_accounts")
    .select("status, payouts_enabled, stripe_account_id")
    .eq("user_id", userId)
    .maybeSingle<DashboardConnectAccountRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function getDashboardConnectCtaStatus(
  supabase: AppSupabaseClient,
  userId: string
): Promise<DetailedAccountStatus | undefined> {
  const account = await getDashboardConnectAccount(supabase, userId);
  return resolveDashboardConnectCtaStatus(account);
}

export async function getDashboardConnectBalance(
  supabase: AppSupabaseClient,
  userId: string
): Promise<number | null> {
  const account = await getDashboardConnectAccount(supabase, userId);

  if (!account) {
    return null;
  }

  return await fetchStripeBalanceByAccountId(account.stripe_account_id);
}
