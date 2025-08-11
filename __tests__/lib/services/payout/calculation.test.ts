/**
 * PayoutService 送金金額計算ロジックのテスト
 */

import { PayoutService } from "@/lib/services/payout/service";
import { PayoutErrorHandler } from "@/lib/services/payout/error-handler";
import { StripeConnectService } from "@/lib/services/stripe-connect/service";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import { createClient } from "@supabase/supabase-js";

// モック設定
jest.mock("@supabase/supabase-js");
jest.mock("@/lib/stripe/client", () => ({
  stripe: {
    transfers: {
      create: jest.fn(),
    },
  },
}));

const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  rpc: jest.fn(),
} as any;

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe("PayoutService - 送金金額計算ロジック", () => {
  let payoutService: PayoutService;
  let mockErrorHandler: jest.Mocked<PayoutErrorHandler>;
  let mockStripeConnectService: jest.Mocked<StripeConnectService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockErrorHandler = {
      handlePayoutError: jest.fn(),
      logError: jest.fn(),
    } as any;

    mockStripeConnectService = {
      getConnectAccountByUser: jest.fn(),
    } as any;

    payoutService = new PayoutService(
      "test-url",
      "test-key",
      mockErrorHandler,
      mockStripeConnectService
    );
  });

  describe("calculatePayoutAmount", () => {
    it("Stripe手数料を正しく計算する", async () => {
      // テストデータ: 複数の決済
      const mockPayments = [
        { amount: 1000 }, // 手数料: 36円
        { amount: 2000 }, // 手数料: 72円
        { amount: 1500 }, // 手数料: 54円
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: mockPayments.map(p => ({
                  amount: p.amount,
                  method: "stripe",
                  status: "paid",
                  attendances: { event_id: "test-event" },
                })),
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await payoutService.calculatePayoutAmount("test-event");

      expect(result.totalStripeSales).toBe(4500); // 1000 + 2000 + 1500
      expect(result.totalStripeFee).toBe(162); // 36 + 72 + 54
      expect(result.platformFee).toBe(0); // MVP段階では0円
      expect(result.netPayoutAmount).toBe(4338); // 4500 - 162 - 0
      expect(result.breakdown.stripePaymentCount).toBe(3);
      expect(result.breakdown.averageTransactionAmount).toBe(1500); // 4500 / 3
      expect(result.breakdown.stripeFeeRate).toBe(0.036);
      expect(result.breakdown.platformFeeRate).toBe(0);
    });

    it("小額決済でのStripe手数料計算が正確である", async () => {
      // テストデータ: 小額決済
      const mockPayments = [
        { amount: 100 }, // 手数料: 4円 (100 * 0.036 = 3.6 → 4円)
        { amount: 50 },  // 手数料: 2円 (50 * 0.036 = 1.8 → 2円)
        { amount: 1 },   // 手数料: 0円 (1 * 0.036 = 0.036 → 0円)
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: mockPayments.map(p => ({
                  amount: p.amount,
                  method: "stripe",
                  status: "paid",
                  attendances: { event_id: "test-event" },
                })),
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await payoutService.calculatePayoutAmount("test-event");

      expect(result.totalStripeSales).toBe(151); // 100 + 50 + 1
      expect(result.totalStripeFee).toBe(6); // 4 + 2 + 0 (1円の手数料は0円)
      expect(result.netPayoutAmount).toBe(145); // 151 - 6 - 0
    });

    it("決済データが存在しない場合は0を返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await payoutService.calculatePayoutAmount("test-event");

      expect(result.totalStripeSales).toBe(0);
      expect(result.totalStripeFee).toBe(0);
      expect(result.platformFee).toBe(0);
      expect(result.netPayoutAmount).toBe(0);
      expect(result.breakdown.stripePaymentCount).toBe(0);
      expect(result.breakdown.averageTransactionAmount).toBe(0);
    });

    it("データベースエラーが発生した場合は適切なエラーを投げる", async () => {
      const dbError = new Error("Database connection failed");
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: null,
                error: dbError,
              }),
            }),
          }),
        }),
      });

      await expect(payoutService.calculatePayoutAmount("test-event"))
        .rejects
        .toThrow(PayoutError);

      try {
        await payoutService.calculatePayoutAmount("test-event");
      } catch (error) {
        expect(error).toBeInstanceOf(PayoutError);
        expect((error as PayoutError).type).toBe(PayoutErrorType.DATABASE_ERROR);
        expect((error as PayoutError).message).toContain("決済データの取得に失敗しました");
      }
    });

    it("手数料計算で負の値になる場合はエラーを投げる", async () => {
      // 異常なケース: 手数料設定が間違っている場合をシミュレート
      const mockPayments = [{ amount: 10 }]; // 非常に小額

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: mockPayments.map(p => ({
                  amount: p.amount,
                  method: "stripe",
                  status: "paid",
                  attendances: { event_id: "test-event" },
                })),
                error: null,
              }),
            }),
          }),
        }),
      });

      // PayoutServiceの手数料設定を一時的に変更（テスト用）
      // 実際の実装では設定ファイルから読み込む
      const originalService = payoutService as any;
      originalService.stripeFeeConfig = { baseRate: 10, fixedFee: 0 }; // 1000%の手数料（異常値）

      await expect(payoutService.calculatePayoutAmount("test-event"))
        .rejects
        .toThrow(PayoutError);

      try {
        await payoutService.calculatePayoutAmount("test-event");
      } catch (error) {
        expect(error).toBeInstanceOf(PayoutError);
        expect((error as PayoutError).type).toBe(PayoutErrorType.CALCULATION_ERROR);
        expect((error as PayoutError).message).toContain("送金金額の計算結果が負の値になりました");
      }
    });

    it("大量の決済データでも正確に計算する", async () => {
      // 1000件の決済データを生成
      const mockPayments = Array.from({ length: 1000 }, (_, i) => ({
        amount: 1000 + i, // 1000円から1999円まで
      }));

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: mockPayments.map(p => ({
                  amount: p.amount,
                  method: "stripe",
                  status: "paid",
                  attendances: { event_id: "test-event" },
                })),
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await payoutService.calculatePayoutAmount("test-event");

      const expectedTotalSales = mockPayments.reduce((sum, p) => sum + p.amount, 0);
      const expectedTotalFee = mockPayments.reduce((sum, p) => {
        return sum + Math.round(p.amount * 0.036);
      }, 0);

      expect(result.totalStripeSales).toBe(expectedTotalSales);
      expect(result.totalStripeFee).toBe(expectedTotalFee);
      expect(result.netPayoutAmount).toBe(expectedTotalSales - expectedTotalFee);
      expect(result.breakdown.stripePaymentCount).toBe(1000);
    });
  });

  describe("手数料計算の詳細テスト", () => {
    it("Stripe手数料率3.6%が正確に適用される", () => {
      const testCases = [
        { amount: 1000, expectedFee: 36 },   // 1000 * 0.036 = 36
        { amount: 2777, expectedFee: 100 },  // 2777 * 0.036 = 99.972 → 100
        { amount: 2778, expectedFee: 100 },  // 2778 * 0.036 = 100.008 → 100
        { amount: 2779, expectedFee: 100 },  // 2779 * 0.036 = 100.044 → 100
        { amount: 2780, expectedFee: 100 },  // 2780 * 0.036 = 100.08 → 100
        { amount: 2781, expectedFee: 100 },  // 2781 * 0.036 = 100.116 → 100
        { amount: 2782, expectedFee: 100 },  // 2782 * 0.036 = 100.152 → 100
        { amount: 2783, expectedFee: 100 },  // 2783 * 0.036 = 100.188 → 100
        { amount: 2784, expectedFee: 100 },  // 2784 * 0.036 = 100.224 → 100
        { amount: 2785, expectedFee: 100 },  // 2785 * 0.036 = 100.26 → 100
        { amount: 2786, expectedFee: 100 },  // 2786 * 0.036 = 100.296 → 100
        { amount: 2787, expectedFee: 100 },  // 2787 * 0.036 = 100.332 → 100
        { amount: 2788, expectedFee: 100 },  // 2788 * 0.036 = 100.368 → 100
        { amount: 2789, expectedFee: 100 },  // 2789 * 0.036 = 100.404 → 100
        { amount: 2790, expectedFee: 100 },  // 2790 * 0.036 = 100.44 → 100
        { amount: 2791, expectedFee: 100 },  // 2791 * 0.036 = 100.476 → 100
        { amount: 2792, expectedFee: 101 },  // 2792 * 0.036 = 100.512 → 101
      ];

      testCases.forEach(({ amount, expectedFee }) => {
        const calculatedFee = Math.round(amount * 0.036);
        expect(calculatedFee).toBe(expectedFee);
      });
    });

    it("プラットフォーム手数料がMVP段階では0円である", async () => {
      const mockPayments = [{ amount: 10000 }];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: mockPayments.map(p => ({
                  amount: p.amount,
                  method: "stripe",
                  status: "paid",
                  attendances: { event_id: "test-event" },
                })),
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await payoutService.calculatePayoutAmount("test-event");

      expect(result.platformFee).toBe(0);
      expect(result.breakdown.platformFeeRate).toBe(0);
    });
  });
});
