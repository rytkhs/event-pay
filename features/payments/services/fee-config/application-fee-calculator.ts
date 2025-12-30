import { type SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";

import { Database } from "@/types/database";

import { FeeConfigService, type PlatformFeeConfig } from "./service";

/**
 * Application Fee 計算結果
 */
export interface ApplicationFeeCalculation {
  /** 決済金額（円） */
  amount: number;
  /** プラットフォーム手数料（円） */
  applicationFeeAmount: number;
  /** 計算に使用した設定 */
  config: PlatformFeeConfig;
  /** 計算詳細（デバッグ用） */
  calculation: {
    /** 割合による手数料 */
    rateFee: number;
    /** 固定手数料 */
    fixedFee: number;
    /** min/max適用前の合計 */
    beforeClipping: number;
    /** min適用後 */
    afterMinimum: number;
    /** max適用後（最終値） */
    afterMaximum: number;
  };
  /** 税額詳細（将来の課税事業者対応） */
  taxCalculation: {
    /** 税率 */
    taxRate: number;
    /** 税抜手数料 */
    feeExcludingTax: number;
    /** 税額 */
    taxAmount: number;
    /** 内税かどうか */
    isTaxIncluded: boolean;
  };
}

/**
 * Destination charges用のApplication Fee計算サービス
 *
 * 計算ロジック:
 * 1. 基本計算: round(amount * platform_fee_rate) + platform_fixed_fee
 * 2. 最小値適用: max(計算値, min_platform_fee)
 * 3. 最大値適用: min(計算値, max_platform_fee)
 * 4. 決済金額上限: min(計算値, amount) - application_fee_amountは決済金額を超えられない
 *
 * 税額計算（将来の課税事業者対応）:
 * - 内税の場合: 手数料総額から税抜金額と税額を逆算
 * - 外税の場合: 税抜手数料に税率を掛けて税額を算出（現在未使用）
 * - MVP段階: 税率0%のため税額は常に0円
 */
export class ApplicationFeeCalculator {
  private feeConfigService: FeeConfigService;

  constructor(supabaseClient: SupabaseClient<Database, "public">) {
    this.feeConfigService = new FeeConfigService(supabaseClient);
  }

  /**
   * Application Fee金額を計算
   * @param amount 決済金額（円）
   * @param forceRefresh fee_configを強制再取得するか
   * @returns 計算結果
   */
  async calculateApplicationFee(
    amount: number,
    forceRefresh = false
  ): Promise<ApplicationFeeCalculation> {
    // 入力値検証
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`Invalid amount: ${amount}. Amount must be a positive integer.`);
    }

    // fee_config取得
    const { platform } = await this.feeConfigService.getConfig(forceRefresh);

    // 計算実行
    const calculation = this.performCalculation(amount, platform);
    const taxCalculation = this.calculateTax(calculation.afterMaximum, platform);

    logger.info("Application fee calculated", {
      category: "payment",
      action: "fee_calculation",
      actor_type: "system",
      amount,
      applicationFeeAmount: calculation.afterMaximum,
      rateFee: calculation.rateFee,
      fixedFee: calculation.fixedFee,
      minimumApplied: calculation.afterMinimum > calculation.beforeClipping,
      maximumApplied: calculation.afterMaximum < calculation.afterMinimum,
      taxRate: taxCalculation.taxRate,
      feeExcludingTax: taxCalculation.feeExcludingTax,
      taxAmount: taxCalculation.taxAmount,
      isTaxIncluded: taxCalculation.isTaxIncluded,
      outcome: "success",
    });

    return {
      amount,
      applicationFeeAmount: calculation.afterMaximum,
      config: platform,
      calculation,
      taxCalculation,
    };
  }

  /**
   * 複数の金額に対してバッチ計算
   * @param amounts 決済金額の配列（円）
   * @param forceRefresh fee_configを強制再取得するか
   * @returns 計算結果の配列
   */
  async calculateApplicationFeeBatch(
    amounts: number[],
    forceRefresh = false
  ): Promise<ApplicationFeeCalculation[]> {
    // 入力値検証
    for (const amount of amounts) {
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error(`Invalid amount: ${amount}. All amounts must be positive integers.`);
      }
    }

    // fee_configを一度だけ取得
    const { platform } = await this.feeConfigService.getConfig(forceRefresh);

    logger.info("Application fee batch calculation started", {
      category: "payment",
      action: "fee_calculation_batch",
      actor_type: "system",
      batchSize: amounts.length,
      totalAmount: amounts.reduce((sum, amount) => sum + amount, 0),
      outcome: "success",
    });

    // 各金額に対して計算実行
    const results = amounts.map((amount) => {
      const calculation = this.performCalculation(amount, platform);
      const taxCalculation = this.calculateTax(calculation.afterMaximum, platform);
      return {
        amount,
        applicationFeeAmount: calculation.afterMaximum,
        config: platform,
        calculation,
        taxCalculation,
      };
    });

    const totalFeeAmount = results.reduce((sum, result) => sum + result.applicationFeeAmount, 0);

    logger.info("Application fee batch calculation completed", {
      category: "payment",
      action: "fee_calculation_batch",
      actor_type: "system",
      batchSize: amounts.length,
      totalFeeAmount,
      outcome: "success",
    });

    return results;
  }

  /**
   * 実際の計算ロジック
   * @param amount 決済金額（円）
   * @param config プラットフォーム手数料設定
   * @returns 計算詳細
   */
  private performCalculation(
    amount: number,
    config: PlatformFeeConfig
  ): ApplicationFeeCalculation["calculation"] {
    // 1. 基本計算: 四捨五入 → 固定手数料追加
    const rateFee = Math.round(amount * config.rate);
    const fixedFee = config.fixedFee;
    const beforeClipping = rateFee + fixedFee;

    // 2. 最小値適用
    const afterMinimum = Math.max(beforeClipping, config.minimumFee);

    // 3. 最大値適用
    let afterMaximum = afterMinimum;
    if (config.maximumFee > 0) {
      afterMaximum = Math.min(afterMinimum, config.maximumFee);
    }

    // 4. 決済金額上限適用（application_fee_amountは決済金額を超えられない）
    afterMaximum = Math.min(afterMaximum, amount);

    return {
      rateFee,
      fixedFee,
      beforeClipping,
      afterMinimum,
      afterMaximum,
    };
  }

  /**
   * 税額計算
   * @param totalFeeAmount 税込手数料額（円）
   * @param config プラットフォーム手数料設定
   * @returns 税額詳細
   */
  private calculateTax(
    totalFeeAmount: number,
    config: PlatformFeeConfig
  ): ApplicationFeeCalculation["taxCalculation"] {
    // MVP段階では税率0%なので、すべて0で返す
    if (config.taxRate === 0) {
      return {
        taxRate: 0,
        feeExcludingTax: totalFeeAmount,
        taxAmount: 0,
        isTaxIncluded: config.isTaxIncluded,
      };
    }

    if (config.isTaxIncluded) {
      // 内税の場合: 税込金額から税抜金額と税額を逆算
      // 税抜金額 = 税込金額 / (1 + 税率)
      const feeExcludingTax = Math.floor(totalFeeAmount / (1 + config.taxRate));
      const taxAmount = totalFeeAmount - feeExcludingTax;

      return {
        taxRate: config.taxRate,
        feeExcludingTax,
        taxAmount,
        isTaxIncluded: true,
      };
    } else {
      // 外税の場合: 税抜手数料に税率を掛けて税額を算出
      // 税額 = 税抜金額 * 税率（四捨五入）
      const taxAmount = Math.round(totalFeeAmount * config.taxRate);

      return {
        taxRate: config.taxRate,
        feeExcludingTax: totalFeeAmount,
        taxAmount,
        isTaxIncluded: false,
      };
    }
  }

  /**
   * 設定値の妥当性チェック
   * @param forceRefresh fee_configを強制再取得するか
   * @returns 設定値とバリデーション結果
   */
  async validateConfig(forceRefresh = false): Promise<{
    config: PlatformFeeConfig;
    isValid: boolean;
    errors: string[];
  }> {
    const { platform } = await this.feeConfigService.getConfig(forceRefresh);
    const errors: string[] = [];

    // 基本的な妥当性チェック
    if (platform.rate < 0) {
      errors.push(`platform_fee_rate must be non-negative, got: ${platform.rate}`);
    }
    if (platform.rate > 1) {
      errors.push(`platform_fee_rate should not exceed 100%, got: ${platform.rate * 100}%`);
    }
    if (platform.fixedFee < 0) {
      errors.push(`platform_fixed_fee must be non-negative, got: ${platform.fixedFee}`);
    }
    if (platform.minimumFee < 0) {
      errors.push(`min_platform_fee must be non-negative, got: ${platform.minimumFee}`);
    }
    if (platform.maximumFee < 0) {
      errors.push(`max_platform_fee must be non-negative, got: ${platform.maximumFee}`);
    }
    if (platform.maximumFee > 0 && platform.maximumFee < platform.minimumFee) {
      errors.push(
        `max_platform_fee (${platform.maximumFee}) must be >= min_platform_fee (${platform.minimumFee})`
      );
    }
    if (platform.taxRate < 0) {
      errors.push(`platform_tax_rate must be non-negative, got: ${platform.taxRate}`);
    }
    if (platform.taxRate > 1) {
      errors.push(`platform_tax_rate should not exceed 100%, got: ${platform.taxRate * 100}%`);
    }

    if (errors.length > 0) {
      logger.warn("Platform fee config validation failed", {
        category: "payment",
        action: "fee_config_validation",
        actor_type: "system",
        errors,
        config: platform,
        outcome: "failure",
      });
    } else {
      logger.debug("Platform fee config validation passed", {
        category: "payment",
        action: "fee_config_validation",
        actor_type: "system",
        config: platform,
        outcome: "success",
      });
    }

    return {
      config: platform,
      isValid: errors.length === 0,
      errors,
    };
  }
}
