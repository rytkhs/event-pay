/**
 * 送金金額計算の詳細ロジック
 */

import { PayoutError, PayoutErrorType, StripeFeeConfig, PlatformFeeConfig } from "./types";

/**
 * 決済データの型定義
 */
export interface PaymentData {
  amount: number;
  method: string;
  status: string;
}

/**
 * 手数料計算結果の型定義
 */
export interface FeeCalculationResult {
  totalAmount: number;
  totalFee: number;
  breakdown: {
    paymentCount: number;
    averageAmount: number;
    feeRate: number;
    perTransactionFees: number[];
  };
}

/**
 * 送金金額計算の詳細結果
 */
export interface DetailedPayoutCalculation {
  totalStripeSales: number;
  totalStripeFee: number;
  platformFee: number;
  netPayoutAmount: number;
  breakdown: {
    stripePaymentCount: number;
    averageTransactionAmount: number;
    stripeFeeRate: number;
    platformFeeRate: number;
    stripeFeeBreakdown: number[];
    platformFeeBreakdown: {
      rateFee: number;
      fixedFee: number;
      minimumFeeApplied: boolean;
      maximumFeeApplied: boolean;
    };
  };
  validation: {
    isValid: boolean;
    warnings: string[];
    errors: string[];
  };
}

/**
 * Stripe手数料計算クラス
 */
export class StripeFeeCalculator {
  constructor(private config: StripeFeeConfig) { }

  /**
   * 単一決済のStripe手数料を計算
   * @param amount 決済金額（円）
   * @returns 手数料（円、四捨五入）
   */
  calculateSinglePaymentFee(amount: number): number {
    if (amount < 0) {
      throw new PayoutError(
        PayoutErrorType.CALCULATION_ERROR,
        "決済金額は0以上である必要があります",
        undefined,
        { amount }
      );
    }

    const fee = amount * this.config.baseRate + this.config.fixedFee;
    return Math.round(fee);
  }

  /**
   * 複数決済のStripe手数料を計算
   * @param payments 決済データの配列
   * @returns 手数料計算結果
   */
  calculateMultiplePaymentsFee(payments: PaymentData[]): FeeCalculationResult {
    if (!Array.isArray(payments)) {
      throw new PayoutError(
        PayoutErrorType.CALCULATION_ERROR,
        "決済データは配列である必要があります"
      );
    }

    const stripePayments = payments.filter(
      p => p.method === "stripe" && p.status === "paid"
    );

    if (stripePayments.length === 0) {
      return {
        totalAmount: 0,
        totalFee: 0,
        breakdown: {
          paymentCount: 0,
          averageAmount: 0,
          feeRate: this.config.baseRate,
          perTransactionFees: [],
        },
      };
    }

    const perTransactionFees: number[] = [];
    let totalAmount = 0;
    let totalFee = 0;

    for (const payment of stripePayments) {
      const amount = payment.amount;
      const fee = this.calculateSinglePaymentFee(amount);

      totalAmount += amount;
      totalFee += fee;
      perTransactionFees.push(fee);
    }

    const averageAmount = stripePayments.length > 0
      ? Math.round(totalAmount / stripePayments.length)
      : 0;

    return {
      totalAmount,
      totalFee,
      breakdown: {
        paymentCount: stripePayments.length,
        averageAmount,
        feeRate: this.config.baseRate,
        perTransactionFees,
      },
    };
  }
}

/**
 * プラットフォーム手数料計算クラス
 */
export class PlatformFeeCalculator {
  constructor(private config: PlatformFeeConfig) { }

  /**
   * プラットフォーム手数料を計算
   * @param totalSales 総売上金額
   * @param paymentCount 決済件数
   * @returns 手数料計算結果
   */
  calculatePlatformFee(totalSales: number, paymentCount: number): {
    totalFee: number;
    breakdown: {
      rateFee: number;
      fixedFee: number;
      minimumFeeApplied: boolean;
      maximumFeeApplied: boolean;
    };
  } {
    if (totalSales < 0 || paymentCount < 0) {
      throw new PayoutError(
        PayoutErrorType.CALCULATION_ERROR,
        "売上金額と決済件数は0以上である必要があります",
        undefined,
        { totalSales, paymentCount }
      );
    }

    // 基本手数料計算
    let rateFee = Math.round(totalSales * this.config.rate);
    let fixedFee = paymentCount * this.config.fixedFee;
    let totalFee = rateFee + fixedFee;

    let minimumFeeApplied = false;
    let maximumFeeApplied = false;

    // 最小手数料の適用
    if (this.config.minimumFee > 0 && totalFee < this.config.minimumFee) {
      totalFee = this.config.minimumFee;
      minimumFeeApplied = true;
    }

    // 最大手数料の適用
    if (this.config.maximumFee > 0 && totalFee > this.config.maximumFee) {
      totalFee = this.config.maximumFee;
      maximumFeeApplied = true;
    }

    return {
      totalFee,
      breakdown: {
        rateFee,
        fixedFee,
        minimumFeeApplied,
        maximumFeeApplied,
      },
    };
  }
}

/**
 * 送金金額計算の統合クラス
 */
export class PayoutCalculator {
  private stripeFeeCalculator: StripeFeeCalculator;
  private platformFeeCalculator: PlatformFeeCalculator;

  constructor(
    stripeFeeConfig: StripeFeeConfig,
    platformFeeConfig: PlatformFeeConfig
  ) {
    this.stripeFeeCalculator = new StripeFeeCalculator(stripeFeeConfig);
    this.platformFeeCalculator = new PlatformFeeCalculator(platformFeeConfig);
  }

  /**
   * 詳細な送金金額計算を実行
   * @param payments 決済データの配列
   * @returns 詳細計算結果
   */
  calculateDetailedPayout(payments: PaymentData[]): DetailedPayoutCalculation {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Stripe手数料計算
      const stripeFeeResult = this.stripeFeeCalculator.calculateMultiplePaymentsFee(payments);

      // プラットフォーム手数料計算
      const platformFeeResult = this.platformFeeCalculator.calculatePlatformFee(
        stripeFeeResult.totalAmount,
        stripeFeeResult.breakdown.paymentCount
      );

      // 純送金額計算
      const netPayoutAmount = stripeFeeResult.totalAmount - stripeFeeResult.totalFee - platformFeeResult.totalFee;

      // バリデーション
      if (netPayoutAmount < 0) {
        errors.push("純送金額が負の値になりました。手数料設定を確認してください。");
      }

      if (stripeFeeResult.breakdown.paymentCount === 0) {
        warnings.push("Stripe決済の完了済み決済が見つかりませんでした。");
      }

      if (stripeFeeResult.totalAmount > 0 && stripeFeeResult.totalAmount < 100) {
        warnings.push("総売上が100円未満です。送金処理が実行されない可能性があります。");
      }

      // 異常に高い手数料率の警告
      const effectiveFeeRate = stripeFeeResult.totalAmount > 0
        ? (stripeFeeResult.totalFee + platformFeeResult.totalFee) / stripeFeeResult.totalAmount
        : 0;

      if (effectiveFeeRate > 0.1) { // 10%を超える場合
        warnings.push(`実効手数料率が${(effectiveFeeRate * 100).toFixed(1)}%と高くなっています。`);
      }

      return {
        totalStripeSales: stripeFeeResult.totalAmount,
        totalStripeFee: stripeFeeResult.totalFee,
        platformFee: platformFeeResult.totalFee,
        netPayoutAmount,
        breakdown: {
          stripePaymentCount: stripeFeeResult.breakdown.paymentCount,
          averageTransactionAmount: stripeFeeResult.breakdown.averageAmount,
          stripeFeeRate: stripeFeeResult.breakdown.feeRate,
          platformFeeRate: this.platformFeeCalculator["config"].rate,
          stripeFeeBreakdown: stripeFeeResult.breakdown.perTransactionFees,
          platformFeeBreakdown: platformFeeResult.breakdown,
        },
        validation: {
          isValid: errors.length === 0,
          warnings,
          errors,
        },
      };

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.CALCULATION_ERROR,
        "送金金額の計算中にエラーが発生しました",
        error as Error
      );
    }
  }

  /**
   * 簡易送金金額計算（既存のインターフェースとの互換性用）
   * @param payments 決済データの配列
   * @returns 基本計算結果
   */
  calculateBasicPayout(payments: PaymentData[]) {
    const detailed = this.calculateDetailedPayout(payments);

    return {
      totalStripeSales: detailed.totalStripeSales,
      totalStripeFee: detailed.totalStripeFee,
      platformFee: detailed.platformFee,
      netPayoutAmount: detailed.netPayoutAmount,
      breakdown: {
        stripePaymentCount: detailed.breakdown.stripePaymentCount,
        averageTransactionAmount: detailed.breakdown.averageTransactionAmount,
        stripeFeeRate: detailed.breakdown.stripeFeeRate,
        platformFeeRate: detailed.breakdown.platformFeeRate,
      },
    };
  }
}

/**
 * デフォルトの手数料設定
 */
export const DEFAULT_STRIPE_FEE_CONFIG: StripeFeeConfig = {
  baseRate: 0.036, // 3.6%
  fixedFee: 0, // 0円
};

export const DEFAULT_PLATFORM_FEE_CONFIG: PlatformFeeConfig = {
  rate: 0, // MVP段階では0%
  fixedFee: 0,
  minimumFee: 0,
  maximumFee: 0,
};

/**
 * デフォルト設定での送金計算インスタンスを作成
 */
export function createDefaultPayoutCalculator(): PayoutCalculator {
  return new PayoutCalculator(
    DEFAULT_STRIPE_FEE_CONFIG,
    DEFAULT_PLATFORM_FEE_CONFIG
  );
}
