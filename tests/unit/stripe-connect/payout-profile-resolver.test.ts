import { resolveCurrentCommunityPayoutProfile } from "@features/stripe-connect/services/payout-profile-resolver";

type MaybeSingleResult = {
  data: unknown;
  error: unknown;
};

function createSupabaseMock(
  resolver: (table: string, column: string, value: string) => MaybeSingleResult
) {
  return {
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn((column: string, value: string) => ({
          maybeSingle: jest.fn().mockResolvedValue(resolver(table, column, value)),
        })),
      })),
    })),
  };
}

describe("resolveCurrentCommunityPayoutProfile", () => {
  it("returns none when current community has no payout profile", async () => {
    const supabase = createSupabaseMock((table) => {
      if (table === "communities") {
        return {
          data: { current_payout_profile_id: null },
          error: null,
        };
      }

      throw new Error(`unexpected table lookup: ${table}`);
    });

    const result = await resolveCurrentCommunityPayoutProfile(supabase as any, {
      communityId: "community-1",
    });

    expect(result).toEqual({
      payoutProfile: null,
      resolvedBy: "none",
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith("communities");
  });

  it("returns none when current community points to a missing payout profile", async () => {
    const supabase = createSupabaseMock((table) => {
      if (table === "communities") {
        return {
          data: { current_payout_profile_id: "profile-missing" },
          error: null,
        };
      }

      if (table === "payout_profiles") {
        return {
          data: null,
          error: null,
        };
      }

      throw new Error(`unexpected table lookup: ${table}`);
    });

    const result = await resolveCurrentCommunityPayoutProfile(supabase as any, {
      communityId: "community-1",
    });

    expect(result).toEqual({
      payoutProfile: null,
      resolvedBy: "none",
    });
    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(supabase.from).toHaveBeenNthCalledWith(1, "communities");
    expect(supabase.from).toHaveBeenNthCalledWith(2, "payout_profiles");
  });

  it("returns the current community payout profile when configured", async () => {
    const payoutProfile = {
      id: "profile-1",
      owner_user_id: "user-1",
      stripe_account_id: "acct_123",
      status: "verified",
      charges_enabled: true,
      payouts_enabled: true,
      representative_community_id: "community-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const supabase = createSupabaseMock((table) => {
      if (table === "communities") {
        return {
          data: { current_payout_profile_id: payoutProfile.id },
          error: null,
        };
      }

      if (table === "payout_profiles") {
        return {
          data: payoutProfile,
          error: null,
        };
      }

      throw new Error(`unexpected table lookup: ${table}`);
    });

    const result = await resolveCurrentCommunityPayoutProfile(supabase as any, {
      communityId: "community-1",
    });

    expect(result).toEqual({
      payoutProfile,
      resolvedBy: "community",
    });
  });
});
