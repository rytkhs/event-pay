/**
 * 送金金額計算ロジック単体のテスト
 */

import {
  StripeFeeCalculator,
  PlatformFeeCalculator,
  PayoutCalculator,
  DEFAULT_STRIPE_FEE_CONFIG,
  DEFAULT_PLATFORM_FEE_CONFIG,
} from "@/lib/services/payout/calculation";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";

describe("送金金額計算ロジック単体テスト", () => {
  describe("StripeFeeCalculator", () => {
    let calculator: StripeFeeCalculator;

    beforeEach(() => {
      calculator = new StripeFeeCalculator(DEFAULT_STRIPE_FEE_CONFIG);
    });

    describe("calculateSinglePaymentFee", () => {
      it("基本的なStripe手数料計算が正確である", () => {
        expect(calculator.calculateSinglePaymentFee(1000)).toBe(36); // 1000 * 0.036 = 36
        expect(calculator.calculateSinglePaymentFee(2000)).toBe(72); // 2000 * 0.036 = 72
        expect(calculator.calculateSinglePaymentFee(1500)).toBe(54); // 1500 * 0.036 = 54
      });

      it("小額決済の手数料計算が正確である", () => {
        expect(calculator.calculateSinglePaymentFee(100)).toBe(4); // 100 * 0.036 = 3.6 → 4
        expect(calculator.calculateSinglePaymentFee(50)).toBe(2);  // 50 * 0.036 = 1.8 → 2
        expect(calculator.calculateSinglePaymentFee(1)).toBe(0);   // 1 * 0.036 = 0.036 → 0
      });

      it("四捨五入が正確に動作する", () => {
        expect(calculator.calculateSinglePaymentFee(2777)).toBe(100); // 2777 * 0.036 = 99.972 → 100
        expect(calculator.calculateSinglePaymentFee(2778)).toBe(100); // 2778 * 0.036 = 100.008 → 100
        expect(calculator.calculateSinglePaymentFee(2792)).toBe(101); // 2792 * 0.036 = 100.512 → 101
      });

      it("負の金額でエラーを投げる", () => {
        expect(() => calculator.calculateSinglePaymentFee(-100))
          .toThrow(PayoutError);
      });

      it("0円の場合は0円を返す", () => {
        expect(calculator.calculateSinglePaymentFee(0)).toBe(0);
      });
    });

    describe("calculateMultiplePaymentsFee", () => {
      it("複数決済の手数料を正確に計算する", () => {
        const payments = [
          { amount: 1000, method: "stripe", status: "paid" },
          { amount: 2000, method: "stripe", status: "paid" },
          { amount: 1500, method: "stripe", status: "paid" },
        ];

        const result = calculator.calculateMultiplePaymentsFee(payments);

        expect(result.totalAmount).toBe(4500);
        expect(result.totalFee).toBe(162); // 36 + 72 + 54
        expect(result.breakdown.paymentCount).toBe(3);
        expect(result.breakdown.averageAmount).toBe(1500);
        expect(result.breakdown.perTransactionFees).toEqual([36, 72, 54]);
      });

      it("Stripe決済以外は除外する", () => {
        const payments = [
          { amount: 1000, method: "stripe", status: "paid" },
          { amount: 2000, method: "cash", status: "received" }, // 除外される
          { amount: 1500, method: "stripe", status: "failed" }, // 除外される
        ];

        const result = calculator.calculateMultiplePaymentsFee(payments);

        expect(result.totalAmount).toBe(1000);
        expect(result.totalFee).toBe(36);
        expect(result.breakdown.paymentCount).toBe(1);
      });

      it("対象決済がない場合は0を返す", () => {
        const payments = [
          { amount: 1000, method: "cash", status: "received" },
          { amount: 2000, method: "stripe", status: "failed" },
        ];

        const result = calculator.calculateMultiplePaymentsFee(payments);

        expect(result.totalAmount).toBe(0);
        expect(result.totalFee).toBe(0);
        expect(result.breakdown.paymentCount).toBe(0);
        expect(result.breakdown.averageAmount).toBe(0);
        expect(result.breakdown.perTransactionFees).toEqual([]);
      });

      it("空配列の場合は0を返す", () => {
        const result = calculator.calculateMultiplePaymentsFee([]);

        expect(result.totalAmount).toBe(0);
        expect(result.totalFee).toBe(0);
        expect(result.breakdown.paymentCount).toBe(0);
      });

      it("配列以外でエラーを投げる", () => {
        expect(() => calculator.calculateMultiplePaymentsFee(null as any))
          .toThrow(PayoutError);
      });
    });
  });

  describe("PlatformFeeCalculator", () => {
    let calculator: PlatformFeeCalculator;

    beforeEach(() => {
      calculator = new PlatformFeeCalculator(DEFAULT_PLATFORM_FEE_CONFIG);
    });

    describe("calculatePlatformFee", () => {
      it("MVP段階では0円を返す", () => {
        const result = calculator.calculatePlatformFee(10000, 5);

        expect(result.totalFee).toBe(0);
        expect(result.breakdown.rateFee).toBe(0);
        expect(result.breakdown.fixedFee).toBe(0);
        expect(result.breakdown.minimumFeeApplied).toBe(false);
        expect(result.breakdown.maximumFeeApplied).toBe(false);
      });

      it("負の値でエラーを投げる", () => {
        expect(() => calculator.calculatePlatformFee(-1000, 5))
          .toThrow(PayoutError);
        expect(() => calculator.calculatePlatformFee(1000, -5))
          .toThrow(PayoutError);
      });
    });

    describe("将来のプラットフォーム手数料設定", () => {
      it("手数料率と固定手数料を正確に計算する", () => {
        const futureConfig = {
          rate: 0.02, // 2%
          fixedFee: 10, // 10円/件
          minimumFee: 100, // 最小100円
          maximumFee: 1000, // 最大1000円
        };
        const futureCalculator = new PlatformFeeCalculator(futureConfig);

        const result = futureCalculator.calculatePlatformFee(5000, 3);

        expect(result.totalFee).toBe(130); // (5000 * 0.02) + (3 * 10) = 100 + 30 = 130
        expect(result.breakdown.rateFee).toBe(100);
        expect(result.breakdown.fixedFee).toBe(30);
        expect(result.breakdown.minimumFeeApplied).toBe(false);
        expect(result.breakdown.maximumFeeApplied).toBe(false);
      });

      it("最小手数料が適用される", () => {
        const futureConfig = {
          rate: 0.01, // 1%
          fixedFee: 5, // 5円/件
          minimumFee: 100, // 最小100円
          maximumFee: 0,
        };
        const futureCalculator = new PlatformFeeCalculator(futureConfig);

        const result = futureCalculator.calculatePlatformFee(1000, 2);

        expect(result.totalFee).toBe(100); // (1000 * 0.01) + (2 * 5) = 20 < 100 → 100
        expect(result.breakdown.minimumFeeApplied).toBe(true);
      });

      it("最大手数料が適用される", () => {
        const futureConfig = {
          rate: 0.1, // 10%
          fixedFee: 100, // 100円/件
          minimumFee: 0,
          maximumFee: 500, // 最大500円
        };
        const futureCalculator = new PlatformFeeCalculator(futureConfig);

        const result = futureCalculator.calculatePlatformFee(10000, 10);

        expect(result.totalFee).toBe(500); // (10000 * 0.1) + (10 * 100) = 2000 > 500 → 500
        expect(result.breakdown.maximumFeeApplied).toBe(true);
      });
    });
  });

  describe("PayoutCalculator", () => {
    let calculator: PayoutCalculator;

    beforeEach(() => {
      calculator = new PayoutCalculator(
        DEFAULT_STRIPE_FEE_CONFIG,
        DEFAULT_PLATFORM_FEE_CONFIG
      );
    });

    describe("calculateBasicPayout", () => {
      it("基本的な送金計算が正確である", () => {
        const payments = [
          { amount: 1000, method: "stripe", status: "paid" },
          { amount: 2000, method: "stripe", status: "paid" },
          { amount: 1500, method: "stripe", status: "paid" },
        ];

        const result = calculator.calculateBasicPayout(payments);

        expect(result.totalStripeSales).toBe(4500);
        expect(result.totalStripeFee).toBe(162); // 36 + 72 + 54
        expect(result.platformFee).toBe(0); // MVP段階では0円
        expect(result.netPayoutAmount).toBe(4338); // 4500 - 162 - 0
        expect(result.breakdown.stripePaymentCount).toBe(3);
        expect(result.breakdown.averageTransactionAmount).toBe(1500);
      });
    });

    describe("calculateDetailedPayout", () => {
      it("詳細な送金計算結果を返す", () => {
        const payments = [
          { amount: 1000, method: "stripe", status: "paid" },
          { amount: 2000, method: "stripe", status: "paid" },
        ];

        const result = calculator.calculateDetailedPayout(payments);

        expect(result.totalStripeSales).toBe(3000);
        expect(result.totalStripeFee).toBe(108); // 36 + 72
        expect(result.platformFee).toBe(0);
        expect(result.netPayoutAmount).toBe(2892);
        expect(result.breakdown.stripeFeeBreakdown).toEqual([36, 72]);
        expect(result.validation.isValid).toBe(true);
        expect(result.validation.errors).toEqual([]);
      });

      it("警告を適切に生成する", () => {
        const payments = [
          { amount: 50, method: "stripe", status: "paid" }, // 小額
        ];

        const result = calculator.calculateDetailedPayout(payments);

        expect(result.validation.warnings).toContain(
          "総売上が100円未満です。送金処理が実行されない可能性があります。"
        );
      });

      it("決済がない場合の警告を生成する", () => {
        const payments = [
          { amount: 1000, method: "cash", status: "received" },
        ];

        const result = calculator.calculateDetailedPayout(payments);

        expect(result.validation.warnings).toContain(
          "Stripe決済の完了済み決済が見つかりませんでした。"
        );
      });

      it("負の送金額でエラーを記録する", () => {
        // 異常な手数料設定でテスト
        const highFeeCalculator = new PayoutCalculator(
          { baseRate: 10, fixedFee: 0 }, // 1000%の手数料
          DEFAULT_PLATFORM_FEE_CONFIG
        );

        const payments = [
          { amount: 100, method: "stripe", status: "paid" },
        ];

        const result = highFeeCalculator.calculateDetailedPayout(payments);

        expect(result.validation.isValid).toBe(false);
        expect(result.validation.errors).toContain(
          "純送金額が負の値になりました。手数料設定を確認してください。"
        );
      });
    });
  });
});
