/**
 * PayoutServiceの手動送金実行条件検証メソッドのテスト
 * タスク7.6.1の統合テスト
 */

import { PayoutService } from "@/lib/services/payout/service";
import { PayoutValidator } from "@/lib/services/payout/validation";
import { PayoutError, PayoutErrorType, ValidateManualPayoutParams, ManualPayoutEligibilityResult } from "@/lib/services/payout/types";

// モック設定
jest.mock("@/lib/services/payout/validation");
const MockPayoutValidator = PayoutValidator as jest.MockedClass<typeof PayoutValidator>;

// その他のモック
const mockErrorHandler = {
  handlePayoutError: jest.fn(),
  logError: jest.fn(),
};

const mockStripeConnectService = {
  getConnectAccountByUser: jest.fn(),
};

const mockStripeTransferService = {
  createTransfer: jest.fn(),
  getTransfer: jest.fn(),
  cancelTransfer: jest.fn(),
};

describe("PayoutService - 手動送金実行条件検証", () => {
  let payoutService: PayoutService;
  let mockValidator: jest.Mocked<PayoutValidator>;

  beforeEach(() => {
    // PayoutValidatorのモックインスタンス
    mockValidator = {
      validateManualPayoutEligibility: jest.fn(),
      validateProcessPayoutParams: jest.fn(),
      validateEventEligibility: jest.fn(),
      validateStripeConnectAccount: jest.fn(),
      validatePayoutAmount: jest.fn(),
      validateStatusTransition: jest.fn(),
    } as any;

    MockPayoutValidator.mockImplementation(() => mockValidator);

    payoutService = new PayoutService(
      "https://mock-url.supabase.co",
      "mock-key",
      mockErrorHandler as any,
      mockStripeConnectService as any,
      mockValidator as any,
      mockStripeTransferService as any
    );

    jest.clearAllMocks();
  });

  describe("validateManualPayoutEligibility", () => {
    const testParams: ValidateManualPayoutParams = {
      eventId: "event-123",
      userId: "user-123",
      minimumAmount: 100,
      daysAfterEvent: 5,
    };

    it("PayoutValidatorに正しくパラメータを委譲する", async () => {
      const mockResult: ManualPayoutEligibilityResult = {
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
        },
      };

      mockValidator.validateManualPayoutEligibility.mockResolvedValue(mockResult);

      const result = await payoutService.validateManualPayoutEligibility(testParams);

      expect(mockValidator.validateManualPayoutEligibility).toHaveBeenCalledWith(testParams);
      expect(result).toEqual(mockResult);
    });

    it("PayoutValidatorからPayoutErrorが投げられた場合、そのまま再スローする", async () => {
      const payoutError = new PayoutError(
        PayoutErrorType.EVENT_NOT_FOUND,
        "イベントが見つかりません"
      );

      mockValidator.validateManualPayoutEligibility.mockRejectedValue(payoutError);

      await expect(payoutService.validateManualPayoutEligibility(testParams))
        .rejects
        .toThrow(payoutError);
    });

    it("PayoutValidator以外のエラーが発生した場合、PayoutErrorでラップする", async () => {
      const genericError = new Error("Unexpected error");
      mockValidator.validateManualPayoutEligibility.mockRejectedValue(genericError);

      await expect(payoutService.validateManualPayoutEligibility(testParams))
        .rejects
        .toThrow(PayoutError);

      try {
        await payoutService.validateManualPayoutEligibility(testParams);
      } catch (error) {
        expect(error).toBeInstanceOf(PayoutError);
        expect((error as PayoutError).type).toBe(PayoutErrorType.DATABASE_ERROR);
        expect((error as PayoutError).message).toBe("手動送金実行条件の検証に失敗しました");
        expect((error as PayoutError).cause).toBe(genericError);
      }
    });

    it("手動送金が可能な場合の結果を正しく返す", async () => {
      const eligibleResult: ManualPayoutEligibilityResult = {
        eligible: true,
        reasons: [],
        details: {
          eventEndedDaysAgo: 10,
          eventEndedCheck: true,
          autoPayoutScheduled: false,
          autoPayoutOverdue: false,
          autoPayoutFailed: false,
          stripeAccountReady: true,
          stripeAccountStatus: "verified",
          payoutsEnabled: true,
          estimatedAmount: 2500,
          minimumAmountMet: true,
          duplicatePayoutExists: false,
        },
      };

      mockValidator.validateManualPayoutEligibility.mockResolvedValue(eligibleResult);

      const result = await payoutService.validateManualPayoutEligibility(testParams);

      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.details.estimatedAmount).toBe(2500);
      expect(result.details.eventEndedDaysAgo).toBe(10);
    });

    it("手動送金が不可能な場合の結果を正しく返す", async () => {
      const ineligibleResult: ManualPayoutEligibilityResult = {
        eligible: false,
        reasons: [
          "イベント終了から5日経過していません。あと2日お待ちください。",
          "Stripe Connectアカウントの認証が完了していません",
        ],
        details: {
          eventEndedDaysAgo: 3,
          eventEndedCheck: false,
          autoPayoutScheduled: false,
          autoPayoutOverdue: false,
          autoPayoutFailed: false,
          stripeAccountReady: false,
          stripeAccountStatus: "pending",
          payoutsEnabled: false,
          estimatedAmount: 1500,
          minimumAmountMet: true,
          duplicatePayoutExists: false,
        },
      };

      mockValidator.validateManualPayoutEligibility.mockResolvedValue(ineligibleResult);

      const result = await payoutService.validateManualPayoutEligibility(testParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toHaveLength(2);
      expect(result.reasons).toContain("イベント終了から5日経過していません。あと2日お待ちください。");
      expect(result.reasons).toContain("Stripe Connectアカウントの認証が完了していません");
    });

    it("自動送金失敗時の手動送金許可ケースを正しく処理する", async () => {
      const failedAutoPayoutResult: ManualPayoutEligibilityResult = {
        eligible: true,
        reasons: [],
        details: {
          eventEndedDaysAgo: 10,
          eventEndedCheck: true,
          autoPayoutScheduled: true,
          autoPayoutOverdue: false,
          autoPayoutFailed: true,
          stripeAccountReady: true,
          stripeAccountStatus: "verified",
          payoutsEnabled: true,
          estimatedAmount: 1800,
          minimumAmountMet: true,
          duplicatePayoutExists: true,
          existingPayoutStatus: "failed",
        },
      };

      mockValidator.validateManualPayoutEligibility.mockResolvedValue(failedAutoPayoutResult);

      const result = await payoutService.validateManualPayoutEligibility(testParams);

      expect(result.eligible).toBe(true);
      expect(result.details.autoPayoutFailed).toBe(true);
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("failed");
    });

    it("自動送金遅延時の手動送金許可ケースを正しく処理する", async () => {
      const overdueAutoPayoutResult: ManualPayoutEligibilityResult = {
        eligible: true,
        reasons: [],
        details: {
          eventEndedDaysAgo: 10,
          eventEndedCheck: true,
          autoPayoutScheduled: true,
          autoPayoutOverdue: true,
          autoPayoutFailed: false,
          stripeAccountReady: true,
          stripeAccountStatus: "verified",
          payoutsEnabled: true,
          estimatedAmount: 2200,
          minimumAmountMet: true,
          duplicatePayoutExists: true,
          existingPayoutStatus: "pending",
        },
      };

      mockValidator.validateManualPayoutEligibility.mockResolvedValue(overdueAutoPayoutResult);

      const result = await payoutService.validateManualPayoutEligibility(testParams);

      expect(result.eligible).toBe(true);
      expect(result.details.autoPayoutOverdue).toBe(true);
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("pending");
    });
  });
});
