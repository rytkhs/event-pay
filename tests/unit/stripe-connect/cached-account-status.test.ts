import { buildConnectAccountStatusPayloadFromCachedAccount } from "@features/stripe-connect/services/cached-account-status";
import type { StripeConnectAccount } from "@features/stripe-connect/types";

describe("buildConnectAccountStatusPayloadFromCachedAccount", () => {
  const baseAccount: Omit<StripeConnectAccount, "status" | "charges_enabled" | "payouts_enabled"> =
    {
      id: "profile-1",
      owner_user_id: "550e8400-e29b-41d4-a716-446655440000",
      stripe_account_id: "acct_test",
      representative_community_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

  it.each([
    ["unverified", "unverified", false, false],
    ["onboarding", "requirements_due", false, false],
    ["verified", "ready", true, true],
    ["restricted", "restricted", false, false],
  ] as const)(
    "maps cached %s account to %s UI status",
    (status, expectedUiStatus, chargesEnabled, payoutsEnabled) => {
      const payload = buildConnectAccountStatusPayloadFromCachedAccount({
        ...baseAccount,
        status,
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
      });

      expect(payload).toEqual({
        hasAccount: true,
        accountId: "acct_test",
        dbStatus: status,
        uiStatus: expectedUiStatus,
        chargesEnabled,
        payoutsEnabled,
      });
    }
  );
});
