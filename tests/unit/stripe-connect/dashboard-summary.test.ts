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
      payoutProfile: {
        id: "profile-1",
        owner_user_id: "user-1",
        stripe_account_id: "acct_ready",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        representative_community_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
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
      payoutProfile: {
        id: "profile-1",
        owner_user_id: "user-1",
        stripe_account_id: "acct_ready",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        representative_community_id: "community-5",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      resolvedBy: "community",
    });

    const balance = await getDashboardConnectBalance({} as any, "user-1", "community-5");

    expect(balance).toBe(4200);
    expect(mockedFetchStripeBalanceByAccountId).toHaveBeenCalledWith("acct_ready");
  });

  it("propagates balance fetch failures without affecting CTA resolution path", async () => {
    mockedFetchStripeBalanceByAccountId.mockRejectedValue(new Error("stripe down"));
    mockedResolveCurrentCommunityPayoutProfile.mockResolvedValue({
      payoutProfile: {
        id: "profile-1",
        owner_user_id: "user-1",
        stripe_account_id: "acct_broken",
        status: "onboarding",
        charges_enabled: false,
        payouts_enabled: false,
        representative_community_id: "community-6",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      resolvedBy: "community",
    });

    await expect(getDashboardConnectBalance({} as any, "user-1", "community-6")).rejects.toThrow(
      "stripe down"
    );
  });

  it("maps verified accounts without payouts to the simplified setup CTA", () => {
    const ctaStatus = resolveDashboardConnectCtaStatus({
      representative_community_id: "community-7",
      status: "verified",
      payouts_enabled: false,
      stripe_account_id: "acct_partial",
    });

    expect(ctaStatus).toEqual(
      expect.objectContaining({
        statusType: "requirements_due",
        actionText: "状況を確認",
      })
    );
  });

  it("returns no CTA only when verified, payouts enabled, and representative community exists", () => {
    const ctaStatus = resolveDashboardConnectCtaStatus({
      representative_community_id: "community-8",
      status: "verified",
      payouts_enabled: true,
      stripe_account_id: "acct_complete",
    });

    expect(ctaStatus).toBeUndefined();
  });
});
