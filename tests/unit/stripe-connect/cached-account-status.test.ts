import { buildConnectAccountStatusPayloadFromCachedAccount } from "@features/stripe-connect/services/cached-account-status";
import type { StripeConnectAccount } from "@features/stripe-connect/types";

describe("buildConnectAccountStatusPayloadFromCachedAccount", () => {
  const baseAccount: Omit<StripeConnectAccount, "status" | "collection_ready" | "payouts_enabled"> =
    {
      id: "profile-1",
      owner_user_id: "550e8400-e29b-41d4-a716-446655440000",
      stripe_account_id: "acct_test",
      representative_community_id: null,
      requirements_disabled_reason: null,
      requirements_summary: {},
      stripe_status_synced_at: null,
      transfers_status: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

  it.each([
    ["unverified", false, "unverified", false],
    ["onboarding", false, "requirements_due", false],
    ["verified", true, "ready", true],
    ["restricted", false, "restricted", false],
  ] as const)(
    "maps cached %s account to expected UI status",
    (status, collectionReady, expectedUiStatus, payoutsEnabled) => {
      const payload = buildConnectAccountStatusPayloadFromCachedAccount({
        ...baseAccount,
        status,
        collection_ready: collectionReady,
        payouts_enabled: payoutsEnabled,
      });

      expect(payload).toEqual(
        expect.objectContaining({
          hasAccount: true,
          accountId: "acct_test",
          dbStatus: status,
          uiStatus: expectedUiStatus,
          collectionReady,
          payoutsEnabled,
        })
      );
    }
  );

  it("uses persisted requirements_summary for degraded UI status", () => {
    const payload = buildConnectAccountStatusPayloadFromCachedAccount({
      ...baseAccount,
      status: "onboarding",
      collection_ready: false,
      payouts_enabled: false,
      requirements_summary: {
        account: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          pending_verification: ["individual.verification.document"],
        },
        transfers: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          pending_verification: [],
        },
        review_state: "pending_review",
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        uiStatus: "pending_review",
        requirements: expect.objectContaining({
          pending_verification: ["individual.verification.document"],
        }),
      })
    );
  });
});
