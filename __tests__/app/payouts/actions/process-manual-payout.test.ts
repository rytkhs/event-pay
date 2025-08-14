/**
 * 手動送金Server Actionのテスト
 */

import { processManualPayoutAction } from "@/app/payouts/actions/process-manual-payout";
import { PayoutService, PayoutValidator, PayoutErrorHandler } from "@/lib/services/payout";
import { StripeConnectService } from "@/lib/services/stripe-connect";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createRateLimitStore, checkRateLimit } from "@/lib/rate-limit";
import { ERROR_CODES } from "@/lib/types/server-actions";
import { AdminReason } from "@/lib/security/secure-client-factory.types";

// モック設定
jest.mock("@/lib/supabase/server");
jest.mock("@supabase/supabase-js");
jest.mock("@/lib/services/payout");
jest.mock("@/lib/services/stripe-connect");
jest.mock("@/lib/rate-limit");
jest.mock("@/lib/security/secure-client-factory.impl", () => {
  const createAuditedAdminClient = jest.fn();
  const instance = { createAuditedAdminClient };
  return {
    SecureSupabaseClientFactory: {
      getInstance: jest.fn(() => instance),
    },
  };
});

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;
const mockCreateRateLimitStore = createRateLimitStore as jest.MockedFunction<typeof createRateLimitStore>;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

const mockPayoutService = PayoutService as jest.MockedClass<typeof PayoutService>;
const mockPayoutValidator = PayoutValidator as jest.MockedClass<typeof PayoutValidator>;
const mockPayoutErrorHandler = PayoutErrorHandler as jest.MockedClass<typeof PayoutErrorHandler>;
const mockStripeConnectService = StripeConnectService as jest.MockedClass<typeof StripeConnectService>;

describe("processManualPayoutAction", () => {
  const mockUser = {
    id: "user-123",
    email: "test@example.com",
  };

  const mockEventId = "550e8400-e29b-41d4-a716-446655440000";
  const mockPayoutId = "550e8400-e29b-41d4-a716-446655440001";
  const mockTransferId = "tr_123";

  let mockSupabaseClient: any;
  let mockAdminClient: any;
  let mockPayoutServiceInstance: any;
  let mockValidatorInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // 環境変数のモック
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    // Supabaseクライアントのモック
    mockSupabaseClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      },
    };

    mockAdminClient = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };

    mockCreateServerClient.mockReturnValue(mockSupabaseClient);
    mockCreateAdminClient.mockReturnValue(mockAdminClient);
    const { SecureSupabaseClientFactory } = require("@/lib/security/secure-client-factory.impl");
    (SecureSupabaseClientFactory.getInstance().createAuditedAdminClient as jest.Mock).mockResolvedValue(
      mockAdminClient
    );

    // レート制限のモック
    mockCreateRateLimitStore.mockResolvedValue({} as any);
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      resetTime: Date.now() + 60000,
    } as any);

    // PayoutServiceのモック
    mockPayoutServiceInstance = {
      validateManualPayoutEligibility: jest.fn(),
      processPayout: jest.fn(),
    };
    mockPayoutService.mockImplementation(() => mockPayoutServiceInstance);

    // PayoutValidatorのモック
    mockValidatorInstance = {};
    mockPayoutValidator.mockImplementation(() => mockValidatorInstance);

    // その他のサービスのモック
    mockPayoutErrorHandler.mockImplementation(
      () =>
        ({
          handlePayoutError: jest.fn(),
          logError: jest.fn(),
          mapStripeError: jest.fn(),
          mapDatabaseError: jest.fn(),
          mapGenericError: jest.fn(),
        } as unknown as PayoutErrorHandler)
    );
    mockStripeConnectService.mockImplementation((..._args: any[]) => ({} as any));
  });

  describe("正常系", () => {
    it("手動送金が正常に実行される", async () => {
      // 手動送金実行条件の検証結果をモック
      mockPayoutServiceInstance.validateManualPayoutEligibility.mockResolvedValue({
        eligible: true,
        reasons: [],
        details: {
          eventEndedCheck: true,
          autoPayoutScheduled: false,
          autoPayoutOverdue: false,
          autoPayoutFailed: false,
          stripeAccountReady: true,
          payoutsEnabled: true,
          minimumAmountMet: true,
          duplicatePayoutExists: false,
          estimatedAmount: 1000,
        },
      });

      // 送金処理の結果をモック
      mockPayoutServiceInstance.processPayout.mockResolvedValue({
        payoutId: mockPayoutId,
        transferId: mockTransferId,
        netAmount: 1000,
        estimatedArrival: "2024-01-15T10:00:00Z",
      });

      const result = await processManualPayoutAction({
        eventId: mockEventId,
        notes: "緊急送金",
      });

      if (!result.success) {
        console.error("Test failed with error:", result.error, result.details);
      }
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          payoutId: mockPayoutId,
          transferId: mockTransferId,
          netAmount: 1000,
          estimatedArrival: "2024-01-15T10:00:00Z",
          isManual: true,
        });
      }

      // 手動送金実行条件の検証が呼ばれることを確認
      expect(mockPayoutServiceInstance.validateManualPayoutEligibility).toHaveBeenCalledWith({
        eventId: mockEventId,
        userId: mockUser.id,
        minimumAmount: 100,
        daysAfterEvent: 5,
      });

      // 送金処理が呼ばれることを確認
      expect(mockPayoutServiceInstance.processPayout).toHaveBeenCalledWith({
        eventId: mockEventId,
        userId: mockUser.id,
        notes: "手動実行: 緊急送金",
      });

      // 手動実行フラグの記録を確認
      expect(mockAdminClient.from).toHaveBeenCalledWith("payouts");
      expect(mockAdminClient.update).toHaveBeenCalledWith({
        notes: "手動実行: 緊急送金",
        updated_at: expect.any(String),
      });

      // 監査ログの記録を確認
      expect(mockAdminClient.from).toHaveBeenCalledWith("system_logs");
      expect(mockAdminClient.insert).toHaveBeenCalledWith({
        operation_type: "manual_payout_execution",
        details: {
          payoutId: mockPayoutId,
          eventId: mockEventId,
          userId: mockUser.id,
          transferId: mockTransferId,
          netAmount: 1000,
          notes: "緊急送金",
          eligibilityDetails: expect.any(Object),
        },
      });
    });

    it("notesなしでも正常に実行される", async () => {
      mockPayoutServiceInstance.validateManualPayoutEligibility.mockResolvedValue({
        eligible: true,
        reasons: [],
        details: {},
      });

      mockPayoutServiceInstance.processPayout.mockResolvedValue({
        payoutId: mockPayoutId,
        transferId: mockTransferId,
        netAmount: 1000,
      });

      const result = await processManualPayoutAction({
        eventId: mockEventId,
      });

      expect(result.success).toBe(true);

      // notesなしの場合のデフォルトメッセージを確認
      expect(mockPayoutServiceInstance.processPayout).toHaveBeenCalledWith({
        eventId: mockEventId,
        userId: mockUser.id,
        notes: "手動実行",
      });
    });
  });

  describe("バリデーションエラー", () => {
    it("無効な入力データでエラーが返される", async () => {
      const result = await processManualPayoutAction({
        eventId: "invalid-uuid",
        notes: "a".repeat(1001), // 1000文字超過
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
        expect(result.error).toBe("入力データが無効です。");
        expect(result.details?.zodErrors).toBeDefined();
      }
    });

    it("eventIdが未指定でエラーが返される", async () => {
      const result = await processManualPayoutAction({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      }
    });
  });

  describe("認証エラー", () => {
    it("未認証ユーザーでエラーが返される", async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const result = await processManualPayoutAction({
        eventId: mockEventId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.UNAUTHORIZED);
        expect(result.error).toBe("認証が必要です。");
      }
    });

    it("認証エラーでエラーが返される", async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Auth error" },
      });

      const result = await processManualPayoutAction({
        eventId: mockEventId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.UNAUTHORIZED);
      }
    });
  });

  describe("レート制限", () => {
    it("レート制限に達した場合エラーが返される", async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        resetTime: Date.now() + 300000,
        retryAfter: 300,
      } as any);

      const result = await processManualPayoutAction({
        eventId: mockEventId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(result.error).toBe("レート制限に達しました。しばらく待ってから再試行してください。");
        expect(result.details?.retryAfter).toBe(300);
      }
    });
  });

  describe("手動送金実行条件エラー", () => {
    it("実行条件を満たしていない場合エラーが返される", async () => {
      mockPayoutServiceInstance.validateManualPayoutEligibility.mockResolvedValue({
        eligible: false,
        reasons: [
          "イベント終了から5日経過していません。あと2日お待ちください。",
          "Stripe Connectアカウントの認証が完了していません",
        ],
        details: {
          eventEndedCheck: false,
          stripeAccountReady: false,
        },
      });

      const result = await processManualPayoutAction({
        eventId: mockEventId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.BUSINESS_RULE_VIOLATION);
        expect(result.error).toBe("手動送金の実行条件を満たしていません。");
        expect(result.details?.reasons).toEqual([
          "イベント終了から5日経過していません。あと2日お待ちください。",
          "Stripe Connectアカウントの認証が完了していません",
        ]);
      }
    });
  });

  describe("PayoutErrorの処理", () => {
    it("PayoutErrorが適切にマッピングされる", async () => {
      mockPayoutServiceInstance.validateManualPayoutEligibility.mockResolvedValue({
        eligible: true,
        reasons: [],
        details: {},
      });

      const payoutError = new PayoutError(
        PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
        "Stripe Connectアカウントが設定されていません"
      );
      mockPayoutServiceInstance.processPayout.mockRejectedValue(payoutError);

      const result = await processManualPayoutAction({
        eventId: mockEventId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.BUSINESS_RULE_VIOLATION);
        expect(result.error).toBe("Stripe Connectアカウントが設定されていません");
        expect(result.details?.payoutErrorType).toBe(PayoutErrorType.STRIPE_ACCOUNT_NOT_READY);
      }
    });

    it("予期しないエラーが適切に処理される", async () => {
      mockPayoutServiceInstance.validateManualPayoutEligibility.mockResolvedValue({
        eligible: true,
        reasons: [],
        details: {},
      });

      const unexpectedError = new Error("Unexpected error");
      mockPayoutServiceInstance.processPayout.mockRejectedValue(unexpectedError);

      const result = await processManualPayoutAction({
        eventId: mockEventId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.INTERNAL_ERROR);
        expect(result.error).toBe("予期しないエラーが発生しました");
      }

      // エラーログが記録されることを確認
      expect(mockAdminClient.from).toHaveBeenCalledWith("system_logs");
      expect(mockAdminClient.insert).toHaveBeenCalledWith({
        operation_type: "manual_payout_error",
        details: {
          eventId: mockEventId,
          error: "Unexpected error",
          stack: expect.any(String),
        },
      });
    });
  });

  describe("環境変数", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = {
        ...originalEnv,
        NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("環境変数が正しく使用される", async () => {
      mockPayoutServiceInstance.validateManualPayoutEligibility.mockResolvedValue({
        eligible: true,
        reasons: [],
        details: {},
      });

      mockPayoutServiceInstance.processPayout.mockResolvedValue({
        payoutId: mockPayoutId,
        transferId: mockTransferId,
        netAmount: 1000,
      });

      await processManualPayoutAction({
        eventId: mockEventId,
      });

      // 監査付き管理者クライアントが生成され、DIされていることを確認
      const { SecureSupabaseClientFactory } = require("@/lib/security/secure-client-factory.impl");
      expect(SecureSupabaseClientFactory.getInstance().createAuditedAdminClient).toHaveBeenCalledWith(
        AdminReason.PAYOUT_PROCESSING,
        "server-actions/process-manual-payout"
      );

      expect(mockStripeConnectService).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object)
      );

      expect(mockPayoutValidator).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object)
      );

      expect(mockPayoutService).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
});
