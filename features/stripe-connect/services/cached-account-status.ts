import type { ConnectAccountStatusPayload, StripeConnectAccount } from "../types";

import {
  flattenRequirementsSummary,
  normalizeRequirementsSummary,
  UIStatusMapper,
} from "./ui-status-mapper";

/**
 * DB に保存されている Connect Account 行だけで UI 用ステータスを組み立てる。
 * Stripe から最新情報を取得できない degraded path で使用する。
 */
export function buildConnectAccountStatusPayloadFromCachedAccount(
  account: StripeConnectAccount
): ConnectAccountStatusPayload {
  const mapper = new UIStatusMapper();
  const requirementsSummary = normalizeRequirementsSummary(
    account.requirements_summary,
    account.requirements_disabled_reason
  );

  return {
    hasAccount: true,
    accountId: account.stripe_account_id,
    dbStatus: account.status,
    uiStatus: mapper.mapStoredAccountToUIStatus({
      dbStatus: account.status,
      collectionReady: account.collection_ready,
      requirementsDisabledReason: account.requirements_disabled_reason,
      requirementsSummary,
      transfersStatus: account.transfers_status,
    }),
    collectionReady: account.collection_ready,
    payoutsEnabled: account.payouts_enabled,
    requirementsSummary,
    requirements: flattenRequirementsSummary(requirementsSummary),
    capabilities: {
      transfers:
        account.transfers_status === "active" ||
        account.transfers_status === "inactive" ||
        account.transfers_status === "pending"
          ? account.transfers_status
          : undefined,
    },
  };
}
