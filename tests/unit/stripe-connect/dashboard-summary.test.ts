import { fetchStripeBalanceByAccountId } from "@features/stripe-connect/actions/get-balance";
import {
  getDashboardConnectBalance,
  getDashboardConnectCtaStatus,
  resolveDashboardConnectCtaStatus,
} from "@features/stripe-connect/services/dashboard-summary";
import { resolveCurrentCommunityPayoutProfile } from "@features/stripe-connect/services/payout-profile-resolver";

jest.mock("@features/stripe-connect/actions/get-balance", () => ({
  fetchStripeBalanceByAccountId: jest.fn(),
}));

jest.mock("@features/stripe-connect/services/payout-profile-resolver", () => ({
  resolveCurrentCommunityPayoutProfile: jest.fn(),
}));

describe("dashboard stripe summary", () => {
  const mockedFetchStripeBalanceByAccountId = jest.mocked(fetchStripeBalanceByAccountId);
  const mockedResolveCurrentCommunityPayoutProfile = jest.mocked(
    resolveCurrentCommunityPayoutProfile
  );

  beforeEach(() => {
    mockedFetchStripeBalanceByAccountId.mockReset();
    mockedResolveCurrentCommunityPayoutProfile.mockReset();
  });

  const buildPayoutProfile = (overrides: Record<string, unknown> = {}) => ({
    id: "profile-1",
    owner_user_id: "user-1",
    stripe_account_id: "acct_ready",
    status: "verified",
    collection_ready: true,
    payouts_enabled: true,
    representative_community_id: "community-1",
    requirements_disabled_reason: null,
    requirements_summary: {},
    stripe_status_synced_at: null,
    transfers_status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  it("returns no-account CTA and skips balance lookup when no connect account exists", async () => {
    mockedResolveCurrentCommunityPayoutProfile.mockResolvedValue({
      payoutProfile: null,
      resolvedBy: "none",
    });

    const ctaStatus = await getDashboardConnectCtaStatus({} as any, "user-1", "community-1");

    expect(ctaStatus).toEqual(expect.objectContaining({ statusType: "no_account" }));
    expect(mockedResolveCurrentCommunityPayoutProfile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        communityId: "community-1",
      })
    );
    expect(mockedFetchStripeBalanceByAccountId).not.toHaveBeenCalled();
  });

  it("returns setup CTA when representative community is missing", async () => {
    mockedResolveCurrentCommunityPayoutProfile.mockResolvedValue({
      payoutProfile: buildPayoutProfile({
        representative_community_id: null,
      }),
      resolvedBy: "community",
    });

    const ctaStatus = await getDashboardConnectCtaStatus({} as any, "user-1", "community-2");

    expect(ctaStatus).toEqual(
      expect.objectContaining({
        statusType: "requirements_due",
        actionUrl: "/settings/payments",
      })
    );
    expect(mockedFetchStripeBalanceByAccountId).not.toHaveBeenCalled();
  });

  it("returns null balance when no connect account exists", async () => {
    mockedResolveCurrentCommunityPayoutProfile.mockResolvedValue({
      payoutProfile: null,
      resolvedBy: "none",
    });

    const balance = await getDashboardConnectBalance({} as any, "user-1", "community-4");

    expect(balance).toBeNull();
    expect(mockedFetchStripeBalanceByAccountId).not.toHaveBeenCalled();
  });

  it("fetches balance when connect account exists", async () => {
    mockedFetchStripeBalanceByAccountId.mockResolvedValue(4200);
    mockedResolveCurrentCommunityPayoutProfile.mockResolvedValue({
      payoutProfile: buildPayoutProfile({
        representative_community_id: "community-5",
      }),
      resolvedBy: "community",
    });

    const balance = await getDashboardConnectBalance({} as any, "user-1", "community-5");

    expect(balance).toBe(4200);
    expect(mockedFetchStripeBalanceByAccountId).toHaveBeenCalledWith("acct_ready");
  });

  it("propagates balance fetch failures without affecting CTA resolution path", async () => {
    mockedFetchStripeBalanceByAccountId.mockRejectedValue(new Error("stripe down"));
    mockedResolveCurrentCommunityPayoutProfile.mockResolvedValue({
      payoutProfile: buildPayoutProfile({
        stripe_account_id: "acct_broken",
        status: "onboarding",
        collection_ready: false,
        payouts_enabled: false,
        representative_community_id: "community-6",
      }),
      resolvedBy: "community",
    });

    await expect(getDashboardConnectBalance({} as any, "user-1", "community-6")).rejects.toThrow(
      "stripe down"
    );
  });

  it("returns no CTA when verified and representative community exists", () => {
    const ctaStatus = resolveDashboardConnectCtaStatus(
      buildPayoutProfile({
        representative_community_id: "community-7",
        status: "verified",
        stripe_account_id: "acct_partial",
      })
    );

    expect(ctaStatus).toBeUndefined();
  });

  it("returns setup CTA when onboarding even if representative community exists", () => {
    const ctaStatus = resolveDashboardConnectCtaStatus(
      buildPayoutProfile({
        representative_community_id: "community-8",
        status: "onboarding",
        collection_ready: false,
        stripe_account_id: "acct_complete",
      })
    );

    expect(ctaStatus).toEqual(
      expect.objectContaining({
        statusType: "requirements_due",
        actionText: "情報を更新する",
      })
    );
  });

  it("returns payout warning CTA when collection is ready but payouts are disabled", () => {
    const ctaStatus = resolveDashboardConnectCtaStatus(
      buildPayoutProfile({
        collection_ready: true,
        payouts_enabled: false,
      })
    );

    expect(ctaStatus).toEqual(
      expect.objectContaining({
        statusType: "ready",
        severity: "warning",
        actionText: "振込設定を確認",
      })
    );
  });

  it("returns pending review CTA from persisted requirements summary", () => {
    const ctaStatus = resolveDashboardConnectCtaStatus(
      buildPayoutProfile({
        status: "onboarding",
        collection_ready: false,
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
      })
    );

    expect(ctaStatus).toEqual(expect.objectContaining({ statusType: "pending_review" }));
  });

  it("does not show dashboard CTA for eventually_due only when collection is ready", () => {
    const ctaStatus = resolveDashboardConnectCtaStatus(
      buildPayoutProfile({
        collection_ready: true,
        requirements_summary: {
          account: {
            currently_due: [],
            past_due: [],
            eventually_due: ["company.verification.document"],
            pending_verification: [],
          },
          transfers: {
            currently_due: [],
            past_due: [],
            eventually_due: [],
            pending_verification: [],
          },
          review_state: "none",
        },
      })
    );

    expect(ctaStatus).toBeUndefined();
  });
});
