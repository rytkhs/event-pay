/**
 * StripeConnectService の単体テスト
 */

import { StripeConnectService, StripeConnectErrorHandler } from "@/lib/services/stripe-connect";
import { StripeConnectError, StripeConnectErrorType } from "@/lib/services/stripe-connect/types";
import { stripe } from "@/lib/stripe/client";

// Stripeのモック
jest.mock("@/lib/stripe/client", () => ({
  stripe: {
    accounts: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    accountLinks: {
      create: jest.fn(),
    },
  },
}));

// Supabaseのモック
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();

const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: mockSingle,
        maybeSingle: mockSingle,
      })),
    })),
    insert: mockInsert,
    update: mockUpdate.mockReturnValue({
      eq: jest.fn(),
    }),
  })),
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

describe("StripeConnectService", () => {
  let service: StripeConnectService;
  let errorHandler: StripeConnectErrorHandler;

  const mockSupabaseUrl = "https://test.supabase.co";
  const mockSupabaseKey = "test-key";

  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockClear();
    mockEq.mockClear();
    mockSingle.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();

    // デフォルトのモック設定をリセット
    mockSelect.mockReturnValue({
      eq: mockEq.mockReturnValue({
        single: mockSingle,
        maybeSingle: mockSingle,
      }),
    });
    mockUpdate.mockReturnValue({
      eq: jest.fn(),
    });

    errorHandler = new StripeConnectErrorHandler();
    service = new StripeConnectService(mockSupabaseUrl, mockSupabaseKey, errorHandler);
  });

  describe("createExpressAccount", () => {
    const validParams = {
      userId: "123e4567-e89b-12d3-a456-426614174000",
      email: "test@example.com",
      country: "JP",
      businessType: "individual" as const,
    };

    describe("正常ケース", () => {
      beforeEach(() => {
        // 既存アカウントなしの設定
        mockSingle.mockResolvedValue({
          data: null,
          error: null,
        });
      });

      it("正常にExpress Accountを作成できる", async () => {
        // Stripe Account作成成功
        const mockStripeAccount = {
          id: "acct_test123",
          type: "express",
          country: "JP",
          email: "test@example.com",
        };
        (stripe.accounts.create as jest.Mock).mockResolvedValue(mockStripeAccount);

        // DB保存成功
        mockInsert.mockResolvedValue({
          data: null,
          error: null,
        });

        const result = await service.createExpressAccount(validParams);

        expect(result).toEqual({
          accountId: "acct_test123",
          status: "unverified",
        });

        expect(stripe.accounts.create).toHaveBeenCalledWith({
          type: "express",
          country: "JP",
          email: "test@example.com",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: "individual",
          metadata: {
            user_id: validParams.userId,
            created_by: "EventPay",
          },
        });

        expect(mockSupabaseClient.from).toHaveBeenCalledWith("stripe_connect_accounts");
      });

      it("businessProfile を指定した場合に Stripe へ business_profile が渡される", async () => {
        // 既存アカウントなし
        mockSingle.mockResolvedValue({ data: null, error: null });

        const mockStripeAccount = {
          id: "acct_test456",
          type: "express",
          country: "JP",
          email: "test@example.com",
        };
        (stripe.accounts.create as jest.Mock).mockResolvedValue(mockStripeAccount);

        // DB保存成功
        mockInsert.mockResolvedValue({ data: null, error: null });

        await service.createExpressAccount({
          ...validParams,
          businessProfile: {
            url: "https://example.com",
            productDescription: "テスト説明",
          },
        } as any);

        expect(stripe.accounts.create).toHaveBeenCalledWith({
          type: "express",
          country: "JP",
          email: "test@example.com",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: "individual",
          metadata: {
            user_id: validParams.userId,
            created_by: "EventPay",
          },
          business_profile: {
            url: "https://example.com",
            product_description: "テスト説明",
          },
        });
      });
    });

    describe("エラーケース", () => {
      it("既存アカウントがある場合はエラーを投げる", async () => {
        // 既存アカウントありの設定
        mockSingle.mockResolvedValue({
          data: {
            user_id: validParams.userId,
            stripe_account_id: "acct_existing123",
            status: "verified",
            charges_enabled: true,
            payouts_enabled: true,
          },
          error: null,
        });

        await expect(service.createExpressAccount(validParams)).rejects.toThrow(StripeConnectError);

        try {
          await service.createExpressAccount(validParams);
          fail('Expected StripeConnectError to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(StripeConnectError);
          expect((error as StripeConnectError).type).toBe(StripeConnectErrorType.ACCOUNT_ALREADY_EXISTS);
        }

        expect(stripe.accounts.create).not.toHaveBeenCalled();
      });

      it("無効なパラメータの場合はバリデーションエラーを投げる", async () => {
        const invalidParams = {
          userId: "invalid-uuid",
          email: "invalid-email",
        };

        await expect(service.createExpressAccount(invalidParams as any)).rejects.toThrow(StripeConnectError);

        try {
          await service.createExpressAccount(invalidParams as any);
          fail('Expected StripeConnectError to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(StripeConnectError);
          expect((error as StripeConnectError).type).toBe(StripeConnectErrorType.VALIDATION_ERROR);
        }
      });
    });
  });

  describe("createAccountLink", () => {
    const validParams = {
      accountId: "acct_test123",
      refreshUrl: "https://example.com/refresh",
      returnUrl: "https://example.com/return",
      type: "account_onboarding" as const,
    };

    it("正常にAccount Linkを生成できる", async () => {
      // モックをリセット
      (stripe.accountLinks.create as jest.Mock).mockReset();

      const mockAccountLink = {
        url: "https://connect.stripe.com/setup/test",
        expires_at: 1234567890,
      };
      (stripe.accountLinks.create as jest.Mock).mockResolvedValue(mockAccountLink);

      const result = await service.createAccountLink(validParams);

      expect(result).toEqual({
        url: "https://connect.stripe.com/setup/test",
        expiresAt: 1234567890,
      });

      expect(stripe.accountLinks.create).toHaveBeenCalledWith({
        account: "acct_test123",
        refresh_url: "https://example.com/refresh",
        return_url: "https://example.com/return",
        type: "account_onboarding",
      });
    });

    it("無効なAccount IDの場合はバリデーションエラーを投げる", async () => {
      const invalidParams = {
        ...validParams,
        accountId: "invalid_account_id",
      };

      await expect(service.createAccountLink(invalidParams)).rejects.toThrow(StripeConnectError);

      try {
        await service.createAccountLink(invalidParams);
        fail('Expected StripeConnectError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StripeConnectError);
        expect((error as StripeConnectError).type).toBe(StripeConnectErrorType.VALIDATION_ERROR);
      }
    });

    it("collectionOptions が指定された場合に collection_options が Stripe に渡される", async () => {
      (stripe.accountLinks.create as jest.Mock).mockReset();

      const mockAccountLink = {
        url: "https://connect.stripe.com/setup/test2",
        expires_at: 2222222222,
      };
      (stripe.accountLinks.create as jest.Mock).mockResolvedValue(mockAccountLink);

      await service.createAccountLink({
        ...validParams,
        collectionOptions: {
          fields: "eventually_due",
          futureRequirements: "include",
        },
      } as any);

      expect(stripe.accountLinks.create).toHaveBeenCalledWith({
        account: "acct_test123",
        refresh_url: "https://example.com/refresh",
        return_url: "https://example.com/return",
        type: "account_onboarding",
        collection_options: {
          fields: "eventually_due",
          future_requirements: "include",
        },
      });
    });
  });

  describe("getAccountInfo", () => {
    it("正常にアカウント情報を取得できる", async () => {
      // モックをリセット
      (stripe.accounts.retrieve as jest.Mock).mockReset();

      const mockAccount = {
        id: "acct_test123",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        email: "test@example.com",
        country: "JP",
        business_type: "individual",
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
        capabilities: {
          card_payments: { status: "active" },
          transfers: { status: "active" },
        },
      };
      (stripe.accounts.retrieve as jest.Mock).mockResolvedValue(mockAccount);

      const result = await service.getAccountInfo("acct_test123");

      expect(result).toEqual({
        accountId: "acct_test123",
        status: "verified",
        chargesEnabled: true,
        payoutsEnabled: true,
        email: "test@example.com",
        country: "JP",
        businessType: "individual",
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
        capabilities: {
          card_payments: "active",
          transfers: "active",
        },
      });
    });
  });

  describe("getConnectAccountByUser", () => {
    it("正常にユーザーのConnect Accountを取得できる", async () => {
      // モックをリセット
      mockSingle.mockReset();

      const mockAccount = {
        user_id: "123e4567-e89b-12d3-a456-426614174000",
        stripe_account_id: "acct_test123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-01T00:00:00Z",
      };

      mockSingle.mockResolvedValue({
        data: mockAccount,
        error: null,
      });

      const result = await service.getConnectAccountByUser("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toEqual(mockAccount);
    });

    it("アカウントが存在しない場合はnullを返す", async () => {
      // モックをリセット
      mockSingle.mockReset();

      mockSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await service.getConnectAccountByUser("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toBeNull();
    });
  });

  describe("isChargesEnabled", () => {
    it("決済受取が有効な場合はtrueを返す", async () => {
      // モックをリセット
      mockSingle.mockReset();

      mockSingle.mockResolvedValue({
        data: {
          charges_enabled: true,
        },
        error: null,
      });

      const result = await service.isChargesEnabled("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toBe(true);
    });

    it("決済受取が無効な場合はfalseを返す", async () => {
      // モックをリセット
      mockSingle.mockReset();

      mockSingle.mockResolvedValue({
        data: {
          charges_enabled: false,
        },
        error: null,
      });

      const result = await service.isChargesEnabled("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toBe(false);
    });

    it("アカウントが存在しない場合はfalseを返す", async () => {
      // モックをリセット
      mockSingle.mockReset();

      mockSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await service.isChargesEnabled("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toBe(false);
    });
  });

  describe("isPayoutsEnabled", () => {
    it("送金が有効な場合はtrueを返す", async () => {
      // モックをリセット
      mockSingle.mockReset();

      mockSingle.mockResolvedValue({
        data: {
          payouts_enabled: true,
        },
        error: null,
      });

      const result = await service.isPayoutsEnabled("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toBe(true);
    });
  });

  describe("isAccountVerified", () => {
    it("アカウントが認証済みの場合はtrueを返す", async () => {
      // モックをリセット
      mockSingle.mockReset();

      mockSingle.mockResolvedValue({
        data: {
          status: "verified",
        },
        error: null,
      });

      const result = await service.isAccountVerified("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toBe(true);
    });

    it("アカウントが未認証の場合はfalseを返す", async () => {
      // モックをリセット
      mockSingle.mockReset();

      mockSingle.mockResolvedValue({
        data: {
          status: "unverified",
        },
        error: null,
      });

      const result = await service.isAccountVerified("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toBe(false);
    });
  });
});
