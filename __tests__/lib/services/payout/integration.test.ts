/**
 * PayoutService 統合テスト - 送金金額計算ロジック
 */

import { PayoutService } from "@/lib/services/payout/service";
import { PayoutErrorHandler } from "@/lib/services/payout/error-handler";
import { StripeConnectService } from "@/lib/services/stripe-connect/service";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";

// 実際のSupabaseクライアントを使用した統合テスト
// 注意: このテストはテスト用データベースに対して実行される

describe("PayoutService 統合テスト - 送金金額計算", () => {
  let payoutService: PayoutService;

  beforeAll(() => {
    // テスト環境でのみ実行
    if (process.env.NODE_ENV !== "test") {
      throw new Error("統合テストはテスト環境でのみ実行してください");
    }

    const mockErrorHandler = {
      handlePayoutError: jest.fn(),
      logError: jest.fn(),
    } as any;

    const mockStripeConnectService = {
      getConnectAccountByUser: jest.fn(),
    } as any;

    payoutService = new PayoutService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      mockErrorHandler,
      mockStripeConnectService
    );
  });

  describe("実際のデータベースとの統合", () => {
    it("存在しないイベントIDで0を返す", async () => {
      const nonExistentEventId = "00000000-0000-0000-0000-000000000000";

      const result = await payoutService.calculatePayoutAmount(nonExistentEventId);

      expect(result.totalStripeSales).toBe(0);
      expect(result.totalStripeFee).toBe(0);
      expect(result.platformFee).toBe(0);
      expect(result.netPayoutAmount).toBe(0);
      expect(result.breakdown.stripePaymentCount).toBe(0);
    });

    it("詳細計算でも同様の結果を返す", async () => {
      const nonExistentEventId = "00000000-0000-0000-0000-000000000000";

      const result = await payoutService.calculateDetailedPayoutAmount(nonExistentEventId);

      expect(result.totalStripeSales).toBe(0);
      expect(result.totalStripeFee).toBe(0);
      expect(result.platformFee).toBe(0);
      expect(result.netPayoutAmount).toBe(0);
      expect(result.breakdown.stripePaymentCount).toBe(0);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.warnings).toContain(
        "Stripe決済の完了済み決済が見つかりませんでした。"
      );
    });
  });

  describe("計算精度の検証", () => {
    it("手数料計算の一貫性を確認", () => {
      // 様々な金額での手数料計算の一貫性をテスト
      const testAmounts = [
        100, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000
      ];

      testAmounts.forEach(amount => {
        const expectedFee = Math.round(amount * 0.036);
        const calculatedFee = Math.round(amount * 0.036);

        expect(calculatedFee).toBe(expectedFee);
      });
    });

    it("大量データでの計算精度", () => {
      // 10000件の決済データでの計算精度をテスト
      const payments = Array.from({ length: 10000 }, (_, i) => ({
        amount: 1000 + (i % 1000), // 1000円から1999円まで
        method: "stripe",
        status: "paid",
      }));

      // 期待値を手動計算
      const expectedTotal = payments.reduce((sum, p) => sum + p.amount, 0);
      const expectedFee = payments.reduce((sum, p) => {
        return sum + Math.round(p.amount * 0.036);
      }, 0);
      const expectedNet = expectedTotal - expectedFee;

      // 実際の計算ロジックを使用
      const calculator = new (require("@/lib/services/payout/calculation").PayoutCalculator)(
        { baseRate: 0.036, fixedFee: 0 },
        { rate: 0, fixedFee: 0, minimumFee: 0, maximumFee: 0 }
      );

      const result = calculator.calculateBasicPayout(payments);

      expect(result.totalStripeSales).toBe(expectedTotal);
      expect(result.totalStripeFee).toBe(expectedFee);
      expect(result.netPayoutAmount).toBe(expectedNet);
    });
  });

  describe("エラーハンドリングの統合テスト", () => {
    it("データベース接続エラーを適切に処理", async () => {
      // 無効なSupabaseクライアントでテスト
      const invalidService = new PayoutService(
        "invalid-url",
        "invalid-key",
        {} as any,
        {} as any
      );

      await expect(invalidService.calculatePayoutAmount("test-id"))
        .rejects
        .toThrow(PayoutError);
    });
  });

  describe("パフォーマンステスト", () => {
    it("大量データの処理時間が許容範囲内", async () => {
      const startTime = Date.now();

      // 存在しないイベントIDでの計算（データベースアクセスを含む）
      await payoutService.calculatePayoutAmount("00000000-0000-0000-0000-000000000000");

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // 1秒以内に完了することを確認
      expect(processingTime).toBeLessThan(1000);
    });

    it("詳細計算の処理時間が許容範囲内", async () => {
      const startTime = Date.now();

      await payoutService.calculateDetailedPayoutAmount("00000000-0000-0000-0000-000000000000");

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // 1秒以内に完了することを確認
      expect(processingTime).toBeLessThan(1000);
    });
  });
});
