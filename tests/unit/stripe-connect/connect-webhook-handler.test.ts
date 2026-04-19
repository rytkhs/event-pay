/**
 * ConnectWebhookHandler 単体テスト
 */

import type Stripe from "stripe";

import { okResult } from "@core/errors";

import { ConnectWebhookHandler } from "@features/stripe-connect/server";

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

const mockSendNotification = jest.fn();
jest.mock("@core/notification/service", () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    sendAccountVerifiedNotification: mockSendNotification,
    sendAccountRestrictedNotification: mockSendNotification,
    sendAccountStatusChangeNotification: mockSendNotification,
  })),
}));

const mockUpdateAccountStatus = jest.fn();
jest.mock("@core/ports/stripe-connect", () => ({
  getStripeConnectPort: jest.fn(() => ({
    updateAccountStatus: mockUpdateAccountStatus,
  })),
  isStripeConnectPortRegistered: jest.fn(() => true),
}));

const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn(() => ({
  select: jest.fn(() => ({
    eq: jest.fn(() => ({
      maybeSingle: mockMaybeSingle,
    })),
  })),
}));
const mockSupabaseClient = {
  from: mockFrom,
};

jest.mock("@core/security/secure-client-factory.impl", () => ({
  createAuditedAdminClient: jest.fn(async () => mockSupabaseClient),
}));

const mockLogStripeConnect = jest.fn().mockResolvedValue(undefined);
const mockLogToSystemLogs = jest.fn().mockResolvedValue(undefined);
jest.mock("@core/logging/system-logger", () => ({
  logStripeConnect: (...args: unknown[]) => mockLogStripeConnect(...args),
  logToSystemLogs: (...args: unknown[]) => mockLogToSystemLogs(...args),
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
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "profile-1",
        owner_user_id: "test_user_id",
        stripe_account_id: "acct_test_123",
        status: "unverified",
        charges_enabled: false,
        payouts_enabled: false,
        representative_community_id: "community-1",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
      error: null,
    });
    mockUpdateAccountStatus.mockResolvedValue(undefined);
    mockSendNotification.mockResolvedValue(okResult(undefined));

    handler = await ConnectWebhookHandler.create();
  });

  describe("handleAccountUpdated", () => {
    test("payout_profile が見つからない場合は ACK skip する", async () => {
      const account = createMockAccount({
        metadata: {},
      });

      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await handler.handleAccountUpdated(account);

      expect(result.success).toBe(true);
      expect(result.meta?.reason).toBe("payout_profile_not_found");
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled();
      expect(mockLogToSystemLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "stripe_connect_account_update_skipped",
          actor_type: "webhook",
          metadata: expect.objectContaining({
            stripe_account_id: "acct_test_123",
          }),
        }),
        expect.any(Object)
      );
    });

    test("actor_id が無くても payout_profile 基準で更新できる", async () => {
      const account = createMockAccount({
        metadata: {},
      });

      await handler.handleAccountUpdated(account);

      expect(mockUpdateAccountStatus).toHaveBeenCalledWith({
        userId: "test_user_id",
        payoutProfileId: "profile-1",
        status: "unverified",
        collectionReady: false,
        payoutsEnabled: false,
        transfersStatus: "inactive",
        requirementsDisabledReason: null,
        requirementsSummary: expect.objectContaining({
          review_state: "none",
          account: expect.objectContaining({
            currently_due: [],
            past_due: [],
            eventually_due: [],
            pending_verification: [],
          }),
          transfers: expect.objectContaining({
            currently_due: [],
            past_due: [],
            eventually_due: [],
            pending_verification: [],
          }),
        }),
        stripeAccountId: "acct_test_123",
        classificationMetadata: expect.objectContaining({
          gate: 2,
          details_submitted: false,
          collection_ready: false,
        }),
        trigger: "webhook",
      });
    });

    test("verified 状態を payout_profile に反映する", async () => {
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

      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: "profile-1",
          owner_user_id: "test_user_id",
          stripe_account_id: "acct_test_123",
          status: "onboarding",
          charges_enabled: false,
          payouts_enabled: false,
          representative_community_id: "community-1",
          created_at: "2026-03-25T00:00:00.000Z",
          updated_at: "2026-03-25T00:00:00.000Z",
        },
        error: null,
      });

      await handler.handleAccountUpdated(account);

      expect(mockUpdateAccountStatus).toHaveBeenCalledWith({
        userId: "test_user_id",
        payoutProfileId: "profile-1",
        status: "verified",
        collectionReady: true,
        payoutsEnabled: true,
        transfersStatus: "active",
        requirementsDisabledReason: null,
        requirementsSummary: expect.objectContaining({
          review_state: "none",
        }),
        stripeAccountId: "acct_test_123",
        classificationMetadata: expect.objectContaining({
          gate: 5,
          details_submitted: true,
          payouts_enabled: true,
          collection_ready: true,
          transfers_active: true,
        }),
        trigger: "webhook",
      });
      expect(mockLogStripeConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "payout_profile.account_status_observed",
          metadata: expect.objectContaining({
            collection_ready: true,
            transfers_status: "active",
            requirements_disabled_reason: null,
            requirements_summary: expect.objectContaining({
              review_state: "none",
            }),
            classification_metadata: expect.objectContaining({
              collection_ready: true,
              transfers_status: "active",
            }),
          }),
        })
      );
    });

    test("restricted 状態を payout_profile に反映する", async () => {
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

      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: "profile-1",
          owner_user_id: "test_user_id",
          stripe_account_id: "acct_test_123",
          status: "verified",
          charges_enabled: true,
          payouts_enabled: true,
          representative_community_id: "community-1",
          created_at: "2026-03-25T00:00:00.000Z",
          updated_at: "2026-03-25T00:00:00.000Z",
        },
        error: null,
      });

      await handler.handleAccountUpdated(account);

      expect(mockUpdateAccountStatus).toHaveBeenCalledWith({
        userId: "test_user_id",
        payoutProfileId: "profile-1",
        status: "restricted",
        collectionReady: false,
        payoutsEnabled: false,
        transfersStatus: "inactive",
        requirementsDisabledReason: "platform_paused",
        requirementsSummary: expect.objectContaining({
          review_state: "none",
          account: expect.objectContaining({
            disabled_reason: "platform_paused",
          }),
        }),
        stripeAccountId: "acct_test_123",
        classificationMetadata: expect.objectContaining({
          gate: 1,
          collection_ready: false,
          disabled_reason: "platform_paused",
        }),
        trigger: "webhook",
      });
    });

    test("エラー発生時は失敗結果を返す", async () => {
      const account = createMockAccount();

      mockMaybeSingle.mockRejectedValueOnce(new Error("Database error"));

      const result = await handler.handleAccountUpdated(account);
      expect(result.success).toBe(false);
    });
  });

  describe("handleAccountApplicationDeauthorized", () => {
    test("アカウント連携解除を payout_profile 基準で処理する", async () => {
      const application: Stripe.Application = {
        id: "ca_test_123",
        object: "application",
        name: "Test App",
      } as Stripe.Application;

      await handler.handleAccountApplicationDeauthorized(application, "acct_test_123");

      expect(mockUpdateAccountStatus).toHaveBeenCalledWith({
        userId: "test_user_id",
        payoutProfileId: "profile-1",
        status: "unverified",
        collectionReady: false,
        payoutsEnabled: false,
        transfersStatus: null,
        requirementsDisabledReason: null,
        requirementsSummary: {
          account: {
            currently_due: [],
            past_due: [],
            eventually_due: [],
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
        stripeAccountId: "acct_test_123",
        trigger: "webhook",
      });
    });

    test("対象 payout_profile が無い場合は ACK skip する", async () => {
      const application: Stripe.Application = {
        id: "ca_test_123",
        object: "application",
        name: "Test App",
      } as Stripe.Application;

      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await handler.handleAccountApplicationDeauthorized(
        application,
        "acct_missing_123"
      );

      expect(result.success).toBe(true);
      expect(result.meta?.reason).toBe("payout_profile_not_found");
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled();
    });
  });
});
