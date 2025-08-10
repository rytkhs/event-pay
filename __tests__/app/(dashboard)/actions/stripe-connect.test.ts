/**
 * Stripe Connect Server Actions のテスト
 */

import { jest } from "@jest/globals";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createStripeConnectService } from "@/lib/services/stripe-connect";
import {
  createConnectAccountAction,
  getConnectAccountStatusAction,
  handleOnboardingReturnAction,
  handleOnboardingRefreshAction,
  checkConnectPermissionsAction,
} from "@/app/(dashboard)/actions/stripe-connect";

// モック設定
const mockRedirect = jest.fn();
jest.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

const mockCreateClient = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

const mockCreateStripeConnectService = jest.fn();
jest.mock("@/lib/services/stripe-connect", () => ({
  createStripeConnectService: mockCreateStripeConnectService,
}));

describe("Stripe Connect Server Actions", () => {
  const mockUser = {
    id: "user-123",
    email: "test@example.com",
  };

  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
  };

  const mockStripeConnectService = {
    getConnectAccountByUser: jest.fn(),
    createExpressAccount: jest.fn(),
    createAccountLink: jest.fn(),
    getAccountInfo: jest.fn(),
    updateAccountStatus: jest.fn(),
    isChargesEnabled: jest.fn(),
    isPayoutsEnabled: jest.fn(),
    isAccountVerified: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
    mockCreateStripeConnectService.mockReturnValue(mockStripeConnectService as any);
  });

  describe("createConnectAccountAction", () => {
    it("認証されていない場合はエラーページにリダイレクトする", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      });

      const formData = new FormData();
      formData.append("refreshUrl", "http://localhost:3000/refresh");
      formData.append("returnUrl", "http://localhost:3000/return");

      await createConnectAccountAction(formData);

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining("/dashboard/connect/error")
      );
    });

    it("無効なURLが指定された場合はバリデーションエラーでリダイレクトする", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const formData = new FormData();
      formData.append("refreshUrl", "invalid-url");
      formData.append("returnUrl", "http://localhost:3000/return");

      await createConnectAccountAction(formData);

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining("/dashboard/connect/error")
      );
      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining("入力データが無効です")
      );
    });

    it("メールアドレスが設定されていない場合はエラーでリダイレクトする", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { ...mockUser, email: null } },
        error: null,
      });

      const formData = new FormData();
      formData.append("refreshUrl", "http://localhost:3000/refresh");
      formData.append("returnUrl", "http://localhost:3000/return");

      await createConnectAccountAction(formData);

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining("/dashboard/connect/error")
      );
      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining("メールアドレスが設定されていません")
      );
    });

    it("既存アカウントがある場合はAccount Linkを生成してリダイレクトする", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const existingAccount = {
        user_id: mockUser.id,
        stripe_account_id: "acct_123",
        status: "onboarding" as const,
        charges_enabled: false,
        payouts_enabled: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(existingAccount);
      mockStripeConnectService.createAccountLink.mockResolvedValue({
        url: "https://connect.stripe.com/setup/123",
        expiresAt: Date.now() + 3600000,
      });

      const formData = new FormData();
      formData.append("refreshUrl", "http://localhost:3000/refresh");
      formData.append("returnUrl", "http://localhost:3000/return");

      await createConnectAccountAction(formData);

      expect(mockStripeConnectService.createAccountLink).toHaveBeenCalledWith({
        accountId: "acct_123",
        refreshUrl: "http://localhost:3000/refresh",
        returnUrl: "http://localhost:3000/return",
        type: "account_onboarding",
      });

      expect(mockRedirect).toHaveBeenCalledWith("https://connect.stripe.com/setup/123");
    });

    it("アカウントが存在しない場合は新規作成してAccount Linkを生成する", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const newAccount = {
        user_id: mockUser.id,
        stripe_account_id: "acct_new123",
        status: "unverified" as const,
        charges_enabled: false,
        payouts_enabled: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockStripeConnectService.getConnectAccountByUser
        .mockResolvedValueOnce(null) // 最初の呼び出しではnull
        .mockResolvedValueOnce(newAccount); // 作成後の呼び出しでは新しいアカウント

      mockStripeConnectService.createExpressAccount.mockResolvedValue({
        accountId: "acct_new123",
        status: "unverified" as const,
      });

      mockStripeConnectService.createAccountLink.mockResolvedValue({
        url: "https://connect.stripe.com/setup/new123",
        expiresAt: Date.now() + 3600000,
      });

      const formData = new FormData();
      formData.append("refreshUrl", "http://localhost:3000/refresh");
      formData.append("returnUrl", "http://localhost:3000/return");

      await createConnectAccountAction(formData);

      expect(mockStripeConnectService.createExpressAccount).toHaveBeenCalledWith({
        userId: mockUser.id,
        email: mockUser.email,
        country: "JP",
        businessType: "individual",
      });

      expect(mockRedirect).toHaveBeenCalledWith("https://connect.stripe.com/setup/new123");
    });
  });

  describe("getConnectAccountStatusAction", () => {
    it("認証されていない場合はエラーを返す", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      });

      const result = await getConnectAccountStatusAction();

      expect(result).toEqual({
        success: false,
        error: "認証が必要です",
      });
    });

    it("アカウントが存在しない場合は適切なレスポンスを返す", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(null);

      const result = await getConnectAccountStatusAction();

      expect(result).toEqual({
        success: true,
        data: {
          hasAccount: false,
          status: null,
          chargesEnabled: false,
          payoutsEnabled: false,
        },
      });
    });

    it("アカウントが存在する場合は最新情報を取得して返す", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const account = {
        user_id: mockUser.id,
        stripe_account_id: "acct_123",
        status: "onboarding" as const,
        charges_enabled: false,
        payouts_enabled: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const accountInfo = {
        accountId: "acct_123",
        status: "verified" as const,
        chargesEnabled: true,
        payoutsEnabled: true,
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
        capabilities: {
          card_payments: "active" as const,
          transfers: "active" as const,
        },
      };

      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(account);
      mockStripeConnectService.getAccountInfo.mockResolvedValue(accountInfo);
      mockStripeConnectService.updateAccountStatus.mockResolvedValue(undefined);

      const result = await getConnectAccountStatusAction();

      expect(mockStripeConnectService.updateAccountStatus).toHaveBeenCalledWith({
        userId: mockUser.id,
        status: "verified",
        chargesEnabled: true,
        payoutsEnabled: true,
      });

      expect(result).toEqual({
        success: true,
        data: {
          hasAccount: true,
          accountId: "acct_123",
          status: "verified",
          chargesEnabled: true,
          payoutsEnabled: true,
          requirements: accountInfo.requirements,
          capabilities: accountInfo.capabilities,
        },
      });
    });
  });

  describe("handleOnboardingReturnAction", () => {
    it("認証されていない場合はログインページにリダイレクトする", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      });

      await handleOnboardingReturnAction();

      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("アカウント情報を同期してダッシュボードにリダイレクトする", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const account = {
        user_id: mockUser.id,
        stripe_account_id: "acct_123",
        status: "onboarding" as const,
        charges_enabled: false,
        payouts_enabled: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const accountInfo = {
        accountId: "acct_123",
        status: "verified" as const,
        chargesEnabled: true,
        payoutsEnabled: true,
      };

      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(account);
      mockStripeConnectService.getAccountInfo.mockResolvedValue(accountInfo);
      mockStripeConnectService.updateAccountStatus.mockResolvedValue(undefined);

      await handleOnboardingReturnAction();

      expect(mockStripeConnectService.updateAccountStatus).toHaveBeenCalledWith({
        userId: mockUser.id,
        status: "verified",
        chargesEnabled: true,
        payoutsEnabled: true,
      });

      expect(mockRedirect).toHaveBeenCalledWith("/dashboard?connect=success");
    });
  });

  describe("handleOnboardingRefreshAction", () => {
    it("認証されていない場合はログインページにリダイレクトする", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      });

      await handleOnboardingRefreshAction();

      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("Connect設定ページにリダイレクトする", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      await handleOnboardingRefreshAction();

      expect(mockRedirect).toHaveBeenCalledWith("/dashboard/connect?refresh=true");
    });
  });

  describe("checkConnectPermissionsAction", () => {
    it("認証されていない場合はエラーを返す", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      });

      const result = await checkConnectPermissionsAction();

      expect(result).toEqual({
        success: false,
        error: "認証に失敗しました",
      });
    });

    it("権限チェックが成功する", async () => {
      const mockAccount = {
        id: "connect_123",
        user_id: mockUser.id,
        stripe_account_id: "acct_123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
      };

      const mockAccountInfo = {
        status: "verified",
        chargesEnabled: true,
        payoutsEnabled: true,
        requirements: {
          currently_due: [],
          past_due: [],
        },
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockStripeConnectService.isChargesEnabled.mockResolvedValue(true);
      mockStripeConnectService.isPayoutsEnabled.mockResolvedValue(true);
      mockStripeConnectService.isAccountVerified.mockResolvedValue(true);
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(mockAccount);
      mockStripeConnectService.getAccountInfo.mockResolvedValue(mockAccountInfo);

      const result = await checkConnectPermissionsAction();

      expect(result).toEqual({
        success: true,
        data: {
          canReceivePayments: true,
          canReceivePayouts: true,
          isVerified: true,
          restrictions: undefined,
        },
      });

      expect(mockStripeConnectService.isChargesEnabled).toHaveBeenCalledWith(mockUser.id);
      expect(mockStripeConnectService.isPayoutsEnabled).toHaveBeenCalledWith(mockUser.id);
      expect(mockStripeConnectService.isAccountVerified).toHaveBeenCalledWith(mockUser.id);
    });

    it("制限事項がある場合は制限情報を返す", async () => {
      const mockAccount = {
        id: "connect_123",
        user_id: mockUser.id,
        stripe_account_id: "acct_123",
        status: "restricted",
        charges_enabled: false,
        payouts_enabled: false,
      };

      const mockAccountInfo = {
        status: "restricted",
        chargesEnabled: false,
        payoutsEnabled: false,
        requirements: {
          currently_due: ["individual.verification.document"],
          past_due: ["individual.id_number"],
        },
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockStripeConnectService.isChargesEnabled.mockResolvedValue(false);
      mockStripeConnectService.isPayoutsEnabled.mockResolvedValue(false);
      mockStripeConnectService.isAccountVerified.mockResolvedValue(false);
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(mockAccount);
      mockStripeConnectService.getAccountInfo.mockResolvedValue(mockAccountInfo);

      const result = await checkConnectPermissionsAction();

      expect(result).toEqual({
        success: true,
        data: {
          canReceivePayments: false,
          canReceivePayouts: false,
          isVerified: false,
          restrictions: [
            "必要な情報: individual.verification.document",
            "期限切れ情報: individual.id_number",
          ],
        },
      });
    });
  });
});
