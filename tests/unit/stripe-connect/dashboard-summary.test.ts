import { fetchStripeBalanceByAccountId } from "@features/stripe-connect/actions/get-balance";
import {
  getDashboardConnectBalance,
  getDashboardConnectCtaStatus,
  resolveDashboardConnectCtaStatus,
} from "@features/stripe-connect/services/dashboard-summary";

jest.mock("@features/stripe-connect/actions/get-balance", () => ({
  fetchStripeBalanceByAccountId: jest.fn(),
}));

function createSupabaseMock(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });

  return {
    supabase: {
      from,
    },
    from,
    select,
    eq,
    maybeSingle,
  };
}

describe("dashboard stripe summary", () => {
  const mockedFetchStripeBalanceByAccountId = jest.mocked(fetchStripeBalanceByAccountId);

  beforeEach(() => {
    mockedFetchStripeBalanceByAccountId.mockReset();
  });

  it("returns no-account CTA and skips balance lookup when no connect account exists", async () => {
    const { supabase, from, select, eq } = createSupabaseMock({
      data: null,
      error: null,
    });

    const ctaStatus = await getDashboardConnectCtaStatus(supabase as any, "user-1");

    expect(ctaStatus).toEqual(expect.objectContaining({ statusType: "no_account" }));
    expect(from).toHaveBeenCalledWith("stripe_connect_accounts");
    expect(select).toHaveBeenCalledWith("status, payouts_enabled, stripe_account_id");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
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

    const ctaStatus = await getDashboardConnectCtaStatus(supabase as any, "user-2");

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

    const ctaStatus = await getDashboardConnectCtaStatus(supabase as any, "user-3");

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
      data: null,
      error: null,
    });

    const balance = await getDashboardConnectBalance(supabase as any, "user-4");

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

    const balance = await getDashboardConnectBalance(supabase as any, "user-5");

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

    await expect(getDashboardConnectBalance(supabase as any, "user-6")).rejects.toThrow(
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
        actionText: "設定を続ける",
      })
    );
  });
});
