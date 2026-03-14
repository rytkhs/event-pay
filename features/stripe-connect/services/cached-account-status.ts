import type { ConnectAccountStatusPayload, StripeConnectAccount } from "../types";

import { UIStatusMapper } from "./ui-status-mapper";

/**
 * DB に保存されている Connect Account 行だけで UI 用ステータスを組み立てる。
 * Stripe から最新情報を取得できない degraded path で使用する。
 */
export function buildConnectAccountStatusPayloadFromCachedAccount(
  account: StripeConnectAccount
): ConnectAccountStatusPayload {
  const mapper = new UIStatusMapper();

  return {
    hasAccount: true,
    accountId: account.stripe_account_id,
    dbStatus: account.status,
    uiStatus: mapper.mapToUIStatus(account.status),
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  };
}
