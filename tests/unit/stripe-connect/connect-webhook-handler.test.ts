/**
 * ConnectWebhookHandler 単体テスト
 *
 * 要件:
 * - 5.2: account.updated Webhookを受信したとき、Account Objectを取得してClassification Algorithmを実行する
 * - 5.3: capabilities.* の status または requirements が変化したとき、Status Synchronizationを実行する
 * - 5.4: payouts_enabled または charges_enabled が変化したとき、Status Synchronizationを実行する
 */

import type Stripe from "stripe";

import { ConnectWebhookHandler } from "@features/stripe-connect/server";

// モック設定
jest.mock("@core/logging/app-logger", () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    withContext: jest.fn(),
  };
  mockLogger.withContext.mockReturnValue(mockLogger);
  return { logger: mockLogger };
});
jest.mock("@core/notification/service");
jest.mock("@core/ports/stripe-connect");
jest.mock("@core/security/secure-client-factory.impl");

const mockGetConnectAccountByUser = jest.fn();
const mockGetAccountInfo = jest.fn();
const mockUpdateAccountStatus = jest.fn();
const mockSendNotification = jest.fn();

// ポートのモック
jest.mock("@core/ports/stripe-connect", () => ({
  getStripeConnectPort: jest.fn(() => ({
    getConnectAccountByUser: mockGetConnectAccountByUser,
    getAccountInfo: mockGetAccountInfo,
    updateAccountStatus: mockUpdateAccountStatus,
  })),
  isStripeConnectPortRegistered: jest.fn(() => true),
}));

// NotificationServiceのモック
jest.mock("@core/notification/service", () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    sendAccountVerifiedNotification: mockSendNotification,
    sendAccountRestrictedNotification: mockSendNotification,
    sendAccountStatusChangeNotification: mockSendNotification,
  })),
}));

// SecureSupabaseClientFactoryのモック
jest.mock("@core/security/secure-client-factory.impl", () => ({
  SecureSupabaseClientFactory: {
    create: jest.fn(() => ({
      createAuditedAdminClient: jest.fn().mockResolvedValue({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({ data: null }),
            })),
          })),
        })),
      }),
    })),
  },
}));

// system-loggerのモック
jest.mock("@core/logging/system-logger", () => ({
  logStripeConnect: jest.fn().mockResolvedValue(undefined),
}));

describe("ConnectWebhookHandler", () => {
  let handler: ConnectWebhookHandler;

  const createMockAccount = (overrides: Partial<Stripe.Account> = {}): Stripe.Account =>
    ({
      id: "acct_test_123",
      object: "account",
      business_type: "individual",
      charges_enabled: false,
      country: "JP",
      created: 1234567890,
      default_currency: "jpy",
      details_submitted: false,
      email: "test@example.com",
      payouts_enabled: false,
      type: "express",
      metadata: {
        actor_id: "test_user_id",
      },
      requirements: {
        currently_due: [],
        past_due: [],
        eventually_due: [],
        disabled_reason: null,
      },
      capabilities: {
        transfers: "inactive",
        card_payments: "inactive",
      },
      ...overrides,
    }) as Stripe.Account;

  beforeEach(async () => {
    jest.clearAllMocks();
    handler = await ConnectWebhookHandler.create();
  });

  describe("handleAccountUpdated", () => {
    test("actor_idが存在しない場合は警告ログを出力して処理を終了する", async () => {
      const account = createMockAccount({
        metadata: {},
      });

      await handler.handleAccountUpdated(account);

      expect(mockGetConnectAccountByUser).not.toHaveBeenCalled();
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled();
    });

    test("unverified状態のアカウントを正しく分類して更新する", async () => {
      const account = createMockAccount({
        details_submitted: false,
        payouts_enabled: false,
        capabilities: {
          transfers: "inactive",
          card_payments: "inactive",
        },
      });

      mockGetConnectAccountByUser.mockResolvedValue({
        user_id: "test_user_id",
        stripe_account_id: "acct_test_123",
        status: "unverified",
        charges_enabled: false,
        payouts_enabled: false,
      });

      await handler.handleAccountUpdated(account);

      expect(mockUpdateAccountStatus).toHaveBeenCalledWith({
        userId: "test_user_id",
        status: "unverified",
        chargesEnabled: false,
        payoutsEnabled: false,
        stripeAccountId: "acct_test_123",
        classificationMetadata: expect.objectContaining({
          gate: 3,
          details_submitted: false,
        }),
        trigger: "webhook",
      });
    });

    test("verified状態のアカウントを正しく分類して更新する", async () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: true,
        charges_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: [],
          past_due: [],
          eventually_due: [],
          errors: [],
          pending_verification: [],
          disabled_reason: null,
        },
      });

      mockGetConnectAccountByUser.mockResolvedValue({
        user_id: "test_user_id",
        stripe_account_id: "acct_test_123",
        status: "onboarding",
        charges_enabled: false,
        payouts_enabled: false,
      });

      await handler.handleAccountUpdated(account);

      expect(mockUpdateAccountStatus).toHaveBeenCalledWith({
        userId: "test_user_id",
        status: "verified",
        chargesEnabled: true,
        payoutsEnabled: true,
        stripeAccountId: "acct_test_123",
        classificationMetadata: expect.objectContaining({
          gate: 5,
          details_submitted: true,
          payouts_enabled: true,
          transfers_active: true,
          card_payments_active: true,
        }),
        trigger: "webhook",
      });
    });

    test("restricted状態のアカウントを正しく分類して更新する", async () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: false,
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: [],
          past_due: [],
          eventually_due: [],
          errors: [],
          pending_verification: [],
          disabled_reason: "platform_paused",
        },
        capabilities: {
          transfers: "inactive",
          card_payments: "inactive",
        },
      });

      mockGetConnectAccountByUser.mockResolvedValue({
        user_id: "test_user_id",
        stripe_account_id: "acct_test_123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
      });

      await handler.handleAccountUpdated(account);

      expect(mockUpdateAccountStatus).toHaveBeenCalledWith({
        userId: "test_user_id",
        status: "restricted",
        chargesEnabled: false,
        payoutsEnabled: false,
        stripeAccountId: "acct_test_123",
        classificationMetadata: expect.objectContaining({
          gate: 1,
          disabled_reason: "platform_paused",
        }),
        trigger: "webhook",
      });
    });

    test("onboarding状態（under_review）のアカウントを正しく分類して更新する", async () => {
      const account = createMockAccount({
        details_submitted: true,
        payouts_enabled: false,
        requirements: {
          alternatives: [],
          current_deadline: null,
          currently_due: [],
          past_due: [],
          eventually_due: [],
          errors: [],
          pending_verification: [],
          disabled_reason: "under_review",
        },
        capabilities: {
          transfers: "pending",
          card_payments: "pending",
        },
      });

      mockGetConnectAccountByUser.mockResolvedValue(null);

      await handler.handleAccountUpdated(account);

      expect(mockUpdateAccountStatus).toHaveBeenCalledWith({
        userId: "test_user_id",
        status: "onboarding",
        chargesEnabled: false,
        payoutsEnabled: false,
        stripeAccountId: "acct_test_123",
        classificationMetadata: expect.objectContaining({
          gate: 2,
          disabled_reason: "under_review",
        }),
        trigger: "webhook",
      });
    });

    test("エラー発生時は失敗結果を返す", async () => {
      const account = createMockAccount();

      mockGetConnectAccountByUser.mockRejectedValue(new Error("Database error"));

      const result = await handler.handleAccountUpdated(account);
      expect(result.success).toBe(false);
    });
  });

  describe("handleAccountApplicationDeauthorized", () => {
    test("アカウント連携解除を正しく処理する", async () => {
      const application: Stripe.Application = {
        id: "ca_test_123",
        object: "application",
        name: "Test App",
      } as Stripe.Application;

      const connectedAccountId = "acct_test_123";

      // getAccountInfoのモック（user_idを取得するために使用される）
      mockGetAccountInfo.mockResolvedValue({
        accountId: connectedAccountId,
        status: "verified",
        chargesEnabled: true,
        payoutsEnabled: true,
      });

      // SecureSupabaseClientFactoryのモックを更新してuser_idを返す
      const mockSupabaseClient = {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { user_id: "test_user_id" },
              }),
            })),
          })),
        })),
      };

      // handlerのsupabaseプロパティを上書き
      (handler as any).supabase = mockSupabaseClient;

      await handler.handleAccountApplicationDeauthorized(application, connectedAccountId);

      expect(mockUpdateAccountStatus).toHaveBeenCalledWith({
        userId: "test_user_id",
        status: "unverified",
        chargesEnabled: false,
        payoutsEnabled: false,
        stripeAccountId: connectedAccountId,
      });
    });
  });
});
