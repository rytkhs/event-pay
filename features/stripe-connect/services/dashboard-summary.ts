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

export interface DashboardConnectSummary {
  balance: number;
  ctaStatus?: DetailedAccountStatus;
}

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

export async function getDashboardConnectSummary(
  supabase: AppSupabaseClient,
  userId: string
): Promise<DashboardConnectSummary> {
  const { data, error } = await supabase
    .from("stripe_connect_accounts")
    .select("status, payouts_enabled, stripe_account_id")
    .eq("user_id", userId)
    .maybeSingle<DashboardConnectAccountRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      balance: 0,
      ctaStatus: resolveDashboardConnectCtaStatus(null),
    };
  }

  const balance = await fetchStripeBalanceByAccountId(data.stripe_account_id);

  return {
    balance,
    ctaStatus: resolveDashboardConnectCtaStatus(data),
  };
}
