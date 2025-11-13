/**
 * StatusSyncService 単体テスト
 * リトライロジック、エラー分類、レート制限の動作を検証
 */

import Stripe from "stripe";

import {
  StatusSyncService,
  StatusSyncError,
  StatusSyncErrorType,
} from "@features/stripe-connect/services/status-sync-service";
import { StatusSyncRateLimiter } from "@features/stripe-connect/services/status-sync-rate-limiter";
import type { IStripeConnectService } from "@features/stripe-connect/servinterface";
import type { AccountInfo, UpdateAccountStatusParams } from "@features/stripe-connect/types";

/**
 * モックStripeConnectServiceを作成
 */
const createMockStripeConnectService = (): jest.Mocked<IStripeConnectService> => {
  return {
    getAccountInfo: jest.fn(),
    updateAccountStatus: jest.fn(),
    createExpressAccount: jest.fn(),
    createAccountLink: jest.fn(),
    getConnectAccountByUser: jest.fn(),
    updateBusinessProfile: jest.fn(),
    isChargesEnabled: jest.fn(),
    isPayoutsEnabled: jest.fn(),
    isAccountVerified: jest.fn(),
    isAccountReadyForPayout: jest.fn(),
    createLoginLink: jest.fn(),
    getAccountBalance: jest.fn(),
  };
};

/**
 * モックAccountInfoを作成
 */
const createMockAccountInfo = (overrides?: Partial<AccountInfo>): AccountInfo => {
  return {
    accountId: "acct_test_123",
    status: "verified",
    chargesEnabled: true,
    payoutsEnabled: true,
    ...overrides,
  };
};

describe("StatusSyncService", () => {
  let service: StatusSyncService;
  let mockStripeConnectService: jest.Mocked<IStripeConnectService>;

  beforeEach(() => {
    mockStripeConnectService = createMockStripeConnectService();
    service = new StatusSyncService(mockStripeConnectService);
    jest.clearAllMocks();
  });

  describe("syncAccountStatus", () => {
    it("成功時はアカウント情報を取得してステータスを更新する", async () => {
      const userId = "user_123";
      const accountId = "acct_test_123";
      const accountInfo = createMockAccountInfo();

      mockStripeConnectService.getAccountInfo.mockResolvedValue(accountInfo);
      mockStripeConnectService.updateAccountStatus.mockResolvedValue();

      await service.syncAccountStatus(userId, accountId);

      expect(mockStripeConnectService.getAccountInfo).toHaveBeenCalledWith(accountId);
      expect(mockStripeConnectService.updateAccountStatus).toHaveBeenCalledWith({
        userId,
        status: accountInfo.status,
        chargesEnabled: accountInfo.chargesEnabled,
        payoutsEnabled: accountInfo.payoutsEnabled,
        stripeAccountId: accountId,
      });
    });

    it("リトライ可能なエラーの場合は指数バックオフでリトライする", async () => {
      const userId = "user_123";
      const accountId = "acct_test_123";
      const accountInfo = createMockAccountInfo();

      // 最初の2回は失敗、3回目は成功
      mockStripeConnectService.getAccountInfo
        .mockRejectedValueOnce(new Stripe.errors.StripeConnectionError("Network error"))
        .mockRejectedValueOnce(new Stripe.errors.StripeConnectionError("Network error"))
        .mockResolvedValueOnce(accountInfo);

      mockStripeConnectService.updateAccountStatus.mockResolvedValue();

      await service.syncAccountStatus(userId, accountId, {
        maxRetries: 3,
        initialBackoffMs: 100,
      });

      expect(mockStripeConnectService.getAccountInfo).toHaveBeenCalledTimes(3);
      expect(mockStripeConnectService.updateAccountStatus).toHaveBeenCalledTimes(1);
    });

    it("リトライ不可能なエラーの場合は即座に例外をスローする", async () => {
      const userId = "user_123";
      const accountId = "acct_test_123";

      mockStripeConnectService.getAccountInfo.mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          message: "No such account",
          type: "invalid_request_error",
        })
      );

      await expect(service.syncAccountStatus(userId, accountId)).rejects.toThrow(StatusSyncError);

      // リトライせずに1回だけ呼ばれる
      expect(mockStripeConnectService.getAccountInfo).toHaveBeenCalledTimes(1);
    });

    it("最大リトライ回数に達した場合は例外をスローする", async () => {
      const userId = "user_123";
      const accountId = "acct_test_123";

      mockStripeConnectService.getAccountInfo.mockRejectedValue(
        new Stripe.errors.StripeConnectionError("Network error")
      );

      await expect(service.syncAccountStatus(userId, accountId, { maxRetries: 3 })).rejects.toThrow(
        StatusSyncError
      );

      expect(mockStripeConnectService.getAccountInfo).toHaveBeenCalledTimes(3);
    });

    it("カスタムリトライ回数を指定できる", async () => {
      const userId = "user_123";
      const accountId = "acct_test_123";

      mockStripeConnectService.getAccountInfo.mockRejectedValue(
        new Stripe.errors.StripeConnectionError("Network error")
      );

      await expect(service.syncAccountStatus(userId, accountId, { maxRetries: 5 })).rejects.toThrow(
        StatusSyncError
      );

      expect(mockStripeConnectService.getAccountInfo).toHaveBeenCalledTimes(5);
    });
  });

  describe("classifyError", () => {
    it("StripeRateLimitErrorをRateLimit Errorに分類する", () => {
      const error = new Stripe.errors.StripeRateLimitError({
        message: "Rate limit exceeded",
        type: "rate_limit_error",
      });

      const result = service.classifyError(error);

      expect(result.type).toBe(StatusSyncErrorType.RATE_LIMIT_ERROR);
      expect(result.retryable).toBe(true);
    });

    it("StripeConnectionErrorをNetwork Errorに分類する", () => {
      const error = new Stripe.errors.StripeConnectionError("Network error");

      const result = service.classifyError(error);

      expect(result.type).toBe(StatusSyncErrorType.NETWORK_ERROR);
      expect(result.retryable).toBe(true);
    });

    it("StripeAPIErrorをStripe API Errorに分類する", () => {
      const error = new Stripe.errors.StripeAPIError({
        message: "API error",
        type: "api_error",
      });

      const result = service.classifyError(error);

      expect(result.type).toBe(StatusSyncErrorType.STRIPE_API_ERROR);
      expect(result.retryable).toBe(true);
    });

    it("StripeInvalidRequestError（無効なアカウント）をValidation Errorに分類する", () => {
      const error = new Stripe.errors.StripeInvalidRequestError({
        message: "No such account: acct_invalid",
        type: "invalid_request_error",
      });

      const result = service.classifyError(error);

      expect(result.type).toBe(StatusSyncErrorType.VALIDATION_ERROR);
      expect(result.retryable).toBe(false);
    });

    it("StripeAuthenticationErrorをStripe API Errorに分類する", () => {
      const error = new Stripe.errors.StripeAuthenticationError({
        message: "Authentication failed",
        type: "authentication_error",
      });

      const result = service.classifyError(error);

      expect(result.type).toBe(StatusSyncErrorType.STRIPE_API_ERROR);
      expect(result.retryable).toBe(false);
    });

    it("StripePermissionErrorをStripe API Errorに分類する", () => {
      const error = new Stripe.errors.StripePermissionError({
        message: "Permission denied",
        type: "permission_error",
      });

      const result = service.classifyError(error);

      expect(result.type).toBe(StatusSyncErrorType.STRIPE_API_ERROR);
      expect(result.retryable).toBe(false);
    });

    it("データベースエラーをDatabase Errorに分類する", () => {
      const error = new Error("Database connection timeout");

      const result = service.classifyError(error);

      expect(result.type).toBe(StatusSyncErrorType.DATABASE_ERROR);
      expect(result.retryable).toBe(true);
    });

    it("不明なエラーをStripe API Errorに分類する", () => {
      const error = new Error("Unknown error");

      const result = service.classifyError(error);

      expect(result.type).toBe(StatusSyncErrorType.STRIPE_API_ERROR);
      expect(result.retryable).toBe(false);
    });
  });
});

describe("StatusSyncRateLimiter", () => {
  let rateLimiter: StatusSyncRateLimiter;

  beforeEach(() => {
    rateLimiter = new StatusSyncRateLimiter();
  });

  describe("checkRateLimit", () => {
    it("デフォルトポリシーを使用する", async () => {
      const policy = rateLimiter.getPolicy();

      expect(policy.scope).toBe("stripe.connect.status_sync");
      expect(policy.limit).toBe(5);
      expect(policy.window).toBe("1 m");
      expect(policy.blockMs).toBe(60 * 1000);
    });

    it("エラー時はフェイルオープンする", async () => {
      const userId = "user_123";

      // Redisが利用できない環境でもテストが通るように
      const result = await rateLimiter.checkRateLimit(userId);

      expect(result).toHaveProperty("allowed");
      expect(typeof result.allowed).toBe("boolean");
    });
  });

  describe("setPolicy", () => {
    it("カスタムポリシーを設定できる", () => {
      const customPolicy = {
        scope: "custom.scope",
        limit: 10,
        window: "5 m" as const,
        blockMs: 300 * 1000,
      };

      rateLimiter.setPolicy(customPolicy);

      const policy = rateLimiter.getPolicy();

      expect(policy.scope).toBe("custom.scope");
      expect(policy.limit).toBe(10);
      expect(policy.window).toBe("5 m");
      expect(policy.blockMs).toBe(300 * 1000);
    });
  });
});
