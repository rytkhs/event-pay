import { ApplicationFeeCalculator } from "@core/stripe/fee-config/application-fee-calculator";
import { FeeConfigService } from "@core/stripe/fee-config/service";

type FeeConfigRow = {
  stripe_base_rate: number;
  stripe_fixed_fee: number;
  platform_fee_rate: number;
  platform_fixed_fee: number;
  min_platform_fee: number;
  max_platform_fee: number;
  min_payout_amount: number;
  payout_request_fee_amount: number;
  platform_tax_rate: number;
  is_tax_included: boolean;
};

const EVENT_ID = "event_test";
const PAYOUT_PROFILE_ID = "payout_profile_test";
const OWNER_USER_ID = "owner_user_test";

function buildFeeConfigRow(overrides: Partial<FeeConfigRow> = {}): FeeConfigRow {
  return {
    stripe_base_rate: 0.036,
    stripe_fixed_fee: 0,
    platform_fee_rate: 0.08,
    platform_fixed_fee: 30,
    min_platform_fee: 0,
    max_platform_fee: 0,
    min_payout_amount: 100,
    payout_request_fee_amount: 260,
    platform_tax_rate: 0,
    is_tax_included: true,
    ...overrides,
  };
}

function buildSelectMaybeSingleResponse(data: unknown) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  };
}

function buildSupabaseClient(params: {
  eventCreatedAt: string;
  ownerCreatedAt: string;
  feeConfig?: Partial<FeeConfigRow>;
}) {
  const feeConfigRow = buildFeeConfigRow(params.feeConfig);

  return {
    from: jest.fn((table: string) => {
      if (table === "fee_config") {
        return {
          select: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: feeConfigRow, error: null }),
            }),
          }),
        };
      }

      if (table === "events") {
        return buildSelectMaybeSingleResponse({ created_at: params.eventCreatedAt });
      }

      if (table === "payout_profiles") {
        return buildSelectMaybeSingleResponse({ owner_user_id: OWNER_USER_ID });
      }

      if (table === "users") {
        return buildSelectMaybeSingleResponse({ created_at: params.ownerCreatedAt });
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("ApplicationFeeCalculator legacy application fee grace", () => {
  beforeEach(() => {
    new FeeConfigService({} as any).invalidateCache();
  });

  it("5/16以前登録ユーザーかつ6/30以前作成イベントでは旧rate/fixedで計算する", async () => {
    const supabase = buildSupabaseClient({
      ownerCreatedAt: "2026-05-16T23:59:59+09:00",
      eventCreatedAt: "2026-06-30T23:59:59+09:00",
    });
    const calculator = new ApplicationFeeCalculator(supabase as any);

    const result = await calculator.calculateApplicationFee(1000, {
      forceRefresh: true,
      eventId: EVENT_ID,
      payoutProfileId: PAYOUT_PROFILE_ID,
    });

    expect(result.applicationFeeAmount).toBe(49);
    expect(result.config).toEqual(
      expect.objectContaining({
        rate: 0.049,
        fixedFee: 0,
      })
    );
  });

  it("5/17以降登録ユーザーでは6/30以前作成イベントでもfee_configのrate/fixedを使う", async () => {
    const supabase = buildSupabaseClient({
      ownerCreatedAt: "2026-05-17T00:00:00+09:00",
      eventCreatedAt: "2026-06-30T23:59:59+09:00",
    });
    const calculator = new ApplicationFeeCalculator(supabase as any);

    const result = await calculator.calculateApplicationFee(1000, {
      forceRefresh: true,
      eventId: EVENT_ID,
      payoutProfileId: PAYOUT_PROFILE_ID,
    });

    expect(result.applicationFeeAmount).toBe(110);
    expect(result.config).toEqual(
      expect.objectContaining({
        rate: 0.08,
        fixedFee: 30,
      })
    );
  });

  it("7/1以降作成イベントでは既存ユーザーでもfee_configのrate/fixedを使う", async () => {
    const supabase = buildSupabaseClient({
      ownerCreatedAt: "2026-05-16T23:59:59+09:00",
      eventCreatedAt: "2026-07-01T00:00:00+09:00",
    });
    const calculator = new ApplicationFeeCalculator(supabase as any);

    const result = await calculator.calculateApplicationFee(1000, {
      forceRefresh: true,
      eventId: EVENT_ID,
      payoutProfileId: PAYOUT_PROFILE_ID,
    });

    expect(result.applicationFeeAmount).toBe(110);
    expect(result.config).toEqual(
      expect.objectContaining({
        rate: 0.08,
        fixedFee: 30,
      })
    );
  });

  it("猶予対象でもmin/maxは現行fee_configの値を使う", async () => {
    const minSupabase = buildSupabaseClient({
      ownerCreatedAt: "2026-05-16T23:59:59+09:00",
      eventCreatedAt: "2026-06-30T23:59:59+09:00",
      feeConfig: { min_platform_fee: 100 },
    });
    const maxSupabase = buildSupabaseClient({
      ownerCreatedAt: "2026-05-16T23:59:59+09:00",
      eventCreatedAt: "2026-06-30T23:59:59+09:00",
      feeConfig: { max_platform_fee: 120 },
    });

    const minResult = await new ApplicationFeeCalculator(minSupabase as any).calculateApplicationFee(
      1000,
      {
        forceRefresh: true,
        eventId: EVENT_ID,
        payoutProfileId: PAYOUT_PROFILE_ID,
      }
    );
    const maxResult = await new ApplicationFeeCalculator(maxSupabase as any).calculateApplicationFee(
      10000,
      {
        forceRefresh: true,
        eventId: EVENT_ID,
        payoutProfileId: PAYOUT_PROFILE_ID,
      }
    );

    expect(minResult.applicationFeeAmount).toBe(100);
    expect(maxResult.applicationFeeAmount).toBe(120);
  });
});
