import { fetchStripeBalanceByAccountId } from "@features/stripe-connect/actions/get-balance";
import {
  getDashboardConnectBalance,
  getDashboardConnectCtaStatus,
  resolveDashboardConnectCtaStatus,
} from "@features/stripe-connect/services/dashboard-summary";

jest.mock("@features/stripe-connect/actions/get-balance", () => ({
  fetchStripeBalanceByAccountId: jest.fn(),
}));

function createSupabaseMock(result: {
  data: unknown;
  error: unknown;
  community?: { data: unknown; error: unknown };
  payoutProfile?: { data: unknown; error: unknown };
}) {
  const communityMaybeSingle = jest.fn().mockResolvedValue(
    "community" in result
      ? result.community
      : {
          data: { current_payout_profile_id: "profile-1" },
          error: null,
        }
  );
  const payoutProfileMaybeSingle = jest.fn().mockResolvedValue(
    "payoutProfile" in result
      ? result.payoutProfile
      : {
          data: result.data,
          error: result.error,
        }
  );
  const communityEq = jest.fn().mockReturnValue({ maybeSingle: communityMaybeSingle });
  const payoutProfileEq = jest.fn().mockReturnValue({ maybeSingle: payoutProfileMaybeSingle });
  const communitySelect = jest.fn().mockReturnValue({ eq: communityEq });
  const payoutProfileSelect = jest.fn().mockReturnValue({ eq: payoutProfileEq });
  const from = jest.fn((table: string) => {
    if (table === "communities") {
      return { select: communitySelect };
    }

    if (table === "payout_profiles") {
      return { select: payoutProfileSelect };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: {
      from,
    },
    from,
    communitySelect,
    payoutProfileSelect,
    communityEq,
    payoutProfileEq,
    communityMaybeSingle,
    payoutProfileMaybeSingle,
  };
}

describe("dashboard stripe summary", () => {
  const mockedFetchStripeBalanceByAccountId = jest.mocked(fetchStripeBalanceByAccountId);

  beforeEach(() => {
    mockedFetchStripeBalanceByAccountId.mockReset();
  });

  it("returns no-account CTA and skips balance lookup when no connect account exists", async () => {
    const { supabase, from, communitySelect, communityEq } = createSupabaseMock({
      community: {
        data: { current_payout_profile_id: null },
        error: null,
      },
      data: null,
      error: null,
    });

    const ctaStatus = await getDashboardConnectCtaStatus(supabase as any, "community-1");

    expect(ctaStatus).toEqual(expect.objectContaining({ statusType: "no_account" }));
    expect(from).toHaveBeenCalledWith("communities");
    expect(communitySelect).toHaveBeenCalledWith("current_payout_profile_id");
    expect(communityEq).toHaveBeenCalledWith("id", "community-1");
    expect(mockedFetchStripeBalanceByAccountId).not.toHaveBeenCalled();
  });

  it("returns no CTA for verified accounts with payouts enabled", async () => {
    const { supabase } = createSupabaseMock({
      data: {
        status: "verified",
        payouts_enabled: true,
        stripe_account_id: "acct_ready",
      },
      error: null,
    });

    const ctaStatus = await getDashboardConnectCtaStatus(supabase as any, "community-2");

    expect(ctaStatus).toBeUndefined();
    expect(mockedFetchStripeBalanceByAccountId).not.toHaveBeenCalled();
  });

  it("returns a simplified setup CTA for onboarding accounts", async () => {
    const { supabase } = createSupabaseMock({
      data: {
        status: "onboarding",
        payouts_enabled: false,
        stripe_account_id: "acct_onboarding",
      },
      error: null,
    });

    const ctaStatus = await getDashboardConnectCtaStatus(supabase as any, "community-3");

    expect(ctaStatus).toEqual(
      expect.objectContaining({
        statusType: "requirements_due",
        actionUrl: "/settings/payments",
      })
    );
    expect(mockedFetchStripeBalanceByAccountId).not.toHaveBeenCalled();
  });

  it("returns null balance when no connect account exists", async () => {
    const { supabase } = createSupabaseMock({
      community: {
        data: { current_payout_profile_id: null },
        error: null,
      },
      data: null,
      error: null,
    });

    const balance = await getDashboardConnectBalance(supabase as any, "community-4");

    expect(balance).toBeNull();
    expect(mockedFetchStripeBalanceByAccountId).not.toHaveBeenCalled();
  });

  it("fetches balance when connect account exists", async () => {
    mockedFetchStripeBalanceByAccountId.mockResolvedValue(4200);
    const { supabase } = createSupabaseMock({
      data: {
        status: "verified",
        payouts_enabled: true,
        stripe_account_id: "acct_ready",
      },
      error: null,
    });

    const balance = await getDashboardConnectBalance(supabase as any, "community-5");

    expect(balance).toBe(4200);
    expect(mockedFetchStripeBalanceByAccountId).toHaveBeenCalledWith("acct_ready");
  });

  it("propagates balance fetch failures without affecting CTA resolution path", async () => {
    mockedFetchStripeBalanceByAccountId.mockRejectedValue(new Error("stripe down"));
    const { supabase } = createSupabaseMock({
      data: {
        status: "onboarding",
        payouts_enabled: false,
        stripe_account_id: "acct_broken",
      },
      error: null,
    });

    await expect(getDashboardConnectBalance(supabase as any, "community-6")).rejects.toThrow(
      "stripe down"
    );
  });

  it("maps verified accounts without payouts to the simplified setup CTA", () => {
    const ctaStatus = resolveDashboardConnectCtaStatus({
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
});
