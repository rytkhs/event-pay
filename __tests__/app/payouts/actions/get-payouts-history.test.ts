/**
 * getPayoutsHistoryAction の軽い単体テスト
 */

import { getPayoutsHistoryAction } from "@/app/payouts/actions/get-payouts-history";
import { PayoutService, PayoutValidator, PayoutErrorHandler } from "@/lib/services/payout";
import { StripeConnectService } from "@/lib/services/stripe-connect";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { ERROR_CODES } from "@/lib/types/server-actions";

// モック設定
jest.mock("@/lib/supabase/server");
jest.mock("@/lib/services/payout");
jest.mock("@/lib/services/stripe-connect");

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;
const mockPayoutService = PayoutService as jest.MockedClass<typeof PayoutService>;
const mockPayoutValidator = PayoutValidator as jest.MockedClass<typeof PayoutValidator>;
const mockPayoutErrorHandler = PayoutErrorHandler as jest.MockedClass<typeof PayoutErrorHandler>;
const mockStripeConnectService = StripeConnectService as jest.MockedClass<typeof StripeConnectService>;

describe("getPayoutsHistoryAction", () => {
  const mockUser = { id: "user-123", email: "test@example.com" };

  let mockSupabaseClient: any;
  let mockPayoutServiceInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    mockSupabaseClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    };
    mockCreateServerClient.mockReturnValue(mockSupabaseClient);

    mockPayoutServiceInstance = {
      getPayoutHistory: jest.fn(),
    };
    mockPayoutService.mockImplementation(() => mockPayoutServiceInstance);

    mockPayoutValidator.mockImplementation(() => ({} as any));
    mockPayoutErrorHandler.mockImplementation(() => ({} as any));
    mockStripeConnectService.mockImplementation(() => ({} as any));
  });

  describe("正常系", () => {
    it("履歴がマッピングされ isManual を含めて返る", async () => {
      // arrange
      const payouts = [
        {
          id: "p1",
          event_id: "e1",
          user_id: mockUser.id,
          total_stripe_sales: 2000,
          total_stripe_fee: 72,
          platform_fee: 0,
          net_payout_amount: 1928,
          status: "completed" as const,
          stripe_transfer_id: "tr_1",
          stripe_account_id: "acct_1",
          webhook_event_id: null,
          webhook_processed_at: null,
          processed_at: "2024-01-15T10:00:00Z",
          notes: "手動実行: 緊急",
          retry_count: 0,
          last_error: null,
          transfer_group: "tg",
          created_at: "2024-01-15T09:00:00Z",
          updated_at: "2024-01-15T10:00:00Z",
        },
        {
          id: "p2",
          event_id: "e2",
          user_id: mockUser.id,
          total_stripe_sales: 1000,
          total_stripe_fee: 36,
          platform_fee: 0,
          net_payout_amount: 964,
          status: "processing" as const,
          stripe_transfer_id: null,
          stripe_account_id: "acct_1",
          webhook_event_id: null,
          webhook_processed_at: null,
          processed_at: null,
          notes: null,
          retry_count: 0,
          last_error: null,
          transfer_group: null,
          created_at: "2024-01-16T09:00:00Z",
          updated_at: "2024-01-16T09:00:00Z",
        },
      ];

      mockPayoutServiceInstance.getPayoutHistory.mockResolvedValue(payouts);

      // act
      const result = await getPayoutsHistoryAction({ status: "completed", limit: 20, offset: 0 });

      // assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
        expect(result.data.items[0]).toMatchObject({
          id: "p1",
          eventId: "e1",
          userId: mockUser.id,
          totalStripeSales: 2000,
          totalStripeFee: 72,
          platformFee: 0,
          netPayoutAmount: 1928,
          status: "completed",
          stripeTransferId: "tr_1",
          processedAt: "2024-01-15T10:00:00Z",
          createdAt: "2024-01-15T09:00:00Z",
          notes: "手動実行: 緊急",
          isManual: true,
        });
        expect(result.data.items[1].isManual).toBe(false);
      }

      expect(mockPayoutServiceInstance.getPayoutHistory).toHaveBeenCalledWith({
        userId: mockUser.id,
        status: "completed",
        eventId: undefined,
        limit: 20,
        offset: 0,
      });
    });
  });

  describe("認証エラー", () => {
    it("未認証で UNAUTHORIZED を返す", async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      const result = await getPayoutsHistoryAction({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.UNAUTHORIZED);
        expect(result.error).toBe("認証が必要です。");
      }
    });
  });

  describe("バリデーションエラー", () => {
    it("limit が 0 でエラー", async () => {
      const result = (await getPayoutsHistoryAction({ limit: 0 })) as any;
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
        expect(result.details?.zodErrors).toBeDefined();
      }
    });
  });

  describe("サービス側エラー", () => {
    it("DBエラーをハンドリングして返す", async () => {
      mockPayoutServiceInstance.getPayoutHistory.mockRejectedValue(
        new PayoutError(PayoutErrorType.DATABASE_ERROR, "DB error")
      );

      const result = await getPayoutsHistoryAction({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ERROR_CODES.DATABASE_ERROR);
        expect(result.error).toBe("DB error");
      }
    });
  });
});
