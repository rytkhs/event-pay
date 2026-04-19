import "server-only";

import type { PayoutProfileRow } from "@core/types/payout-profile";
import type { AppSupabaseClient } from "@core/types/supabase";

import { fetchStripeBalanceByAccountId } from "../actions/get-balance";
import {
  buildRequirementsDueStatus,
  DASHBOARD_SETUP_INCOMPLETE_STATUS,
  NO_ACCOUNT_STATUS,
  PAYOUTS_DISABLED_STATUS,
  PENDING_REVIEW_STATUS,
  RESTRICTED_STATUS,
  UNVERIFIED_STATUS,
} from "../constants/detailed-account-status";
import type { DetailedAccountStatus } from "../types";

import { resolveCurrentCommunityPayoutProfile } from "./payout-profile-resolver";
import {
  flattenRequirementsSummary,
  normalizeRequirementsSummary,
  UIStatusMapper,
} from "./ui-status-mapper";

function hasBlockingDisabledReason(disabledReason?: string): boolean {
  return (
    !!disabledReason &&
    disabledReason !== "under_review" &&
    disabledReason !== "requirements.pending_verification" &&
    disabledReason.startsWith("requirements.")
  );
}

type DashboardPayoutProfileRow = Pick<
  PayoutProfileRow,
  | "representative_community_id"
  | "status"
  | "stripe_account_id"
  | "collection_ready"
  | "payouts_enabled"
  | "requirements_disabled_reason"
  | "requirements_summary"
  | "transfers_status"
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

  const mapper = new UIStatusMapper();
  const requirementsSummary = normalizeRequirementsSummary(
    account.requirements_summary,
    account.requirements_disabled_reason
  );
  const uiStatus = mapper.mapStoredAccountToUIStatus({
    dbStatus: account.status,
    collectionReady: account.collection_ready,
    requirementsDisabledReason: account.requirements_disabled_reason,
    requirementsSummary,
    transfersStatus: account.transfers_status,
  });

  switch (uiStatus) {
    case "restricted":
      return RESTRICTED_STATUS;
    case "unverified":
      return UNVERIFIED_STATUS;
    case "pending_review":
      return PENDING_REVIEW_STATUS;
    case "ready":
      return account.payouts_enabled ? undefined : PAYOUTS_DISABLED_STATUS;
    case "requirements_due": {
      const requirements = flattenRequirementsSummary(requirementsSummary);
      return buildRequirementsDueStatus({
        hasPastDue: requirements.past_due.length > 0,
        hasCurrentlyDue: requirements.currently_due.length > 0,
        hasBlockingDisabledReason: hasBlockingDisabledReason(requirements.disabled_reason),
      });
    }
    case "no_account":
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
    status: payoutProfile.status,
    stripe_account_id: payoutProfile.stripe_account_id,
    collection_ready: payoutProfile.collection_ready,
    payouts_enabled: payoutProfile.payouts_enabled,
    requirements_disabled_reason: payoutProfile.requirements_disabled_reason,
    requirements_summary: payoutProfile.requirements_summary,
    transfers_status: payoutProfile.transfers_status,
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
