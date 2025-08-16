import { FeeConfigService, type PlatformFeeConfig } from './service';
import { type SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';
import { logger } from '@/lib/logging/app-logger';

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
}

/**
 * Destination charges用のApplication Fee計算サービス
 *
 * 計算ロジック:
 * 1. 基本計算: round(amount * platform_fee_rate) + platform_fixed_fee
 * 2. 最小値適用: max(計算値, min_platform_fee)
 * 3. 最大値適用: min(計算値, max_platform_fee)
 * 4. 決済金額上限: min(計算値, amount) - application_fee_amountは決済金額を超えられない
 */
export class ApplicationFeeCalculator {
  private feeConfigService: FeeConfigService;

  constructor(supabaseClient: SupabaseClient<Database>) {
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

    logger.info('Application fee calculated', {
      tag: 'feeCalculated',
      service: 'ApplicationFeeCalculator',
      amount,
      applicationFeeAmount: calculation.afterMaximum,
      rateFee: calculation.rateFee,
      fixedFee: calculation.fixedFee,
      minimumApplied: calculation.afterMinimum > calculation.beforeClipping,
      maximumApplied: calculation.afterMaximum < calculation.afterMinimum,
    });

    return {
      amount,
      applicationFeeAmount: calculation.afterMaximum,
      config: platform,
      calculation,
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

    logger.info('Application fee batch calculation started', {
      tag: 'batchCalculation',
      service: 'ApplicationFeeCalculator',
      batchSize: amounts.length,
      totalAmount: amounts.reduce((sum, amount) => sum + amount, 0),
    });

    // 各金額に対して計算実行
    const results = amounts.map(amount => {
      const calculation = this.performCalculation(amount, platform);
      return {
        amount,
        applicationFeeAmount: calculation.afterMaximum,
        config: platform,
        calculation,
      };
    });

    const totalFeeAmount = results.reduce((sum, result) => sum + result.applicationFeeAmount, 0);

    logger.info('Application fee batch calculation completed', {
      tag: 'batchCalculationCompleted',
      service: 'ApplicationFeeCalculator',
      batchSize: amounts.length,
      totalFeeAmount,
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
  ): ApplicationFeeCalculation['calculation'] {
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
      errors.push(`max_platform_fee (${platform.maximumFee}) must be >= min_platform_fee (${platform.minimumFee})`);
    }

    if (errors.length > 0) {
      logger.warn('Platform fee config validation failed', {
        tag: 'configValidationFailed',
        service: 'ApplicationFeeCalculator',
        errors,
        config: platform,
      });
    } else {
      logger.debug('Platform fee config validation passed', {
        tag: 'configValidationPassed',
        service: 'ApplicationFeeCalculator',
        config: platform,
      });
    }

    return {
      config: platform,
      isValid: errors.length === 0,
      errors,
    };
  }
}

/**
 * 代表的なテストケースの期待値
 * テストファイルで使用するための定数
 */
export const TEST_CASES = {
  /** 1000円の場合の期待値（設定: rate=0%, fixed=0, min=0, max=0） */
  AMOUNT_1000_NO_FEE: {
    amount: 1000,
    expected: 0,
    description: '手数料なし設定での1000円',
  },
  /** 999円の場合の期待値（設定: rate=3%, fixed=30, min=50, max=500） */
  AMOUNT_999_WITH_FEE: {
    amount: 999,
    expected: 60, // round(999 * 0.03) = 30 → 30 + 30 = 60 (> min 50) なので最終値は 60
    description: '手数料あり設定での999円（最小値を上回るため 60 が適用）',
  },
  /** 1円の場合の期待値（設定: rate=3%, fixed=30, min=50, max=500） */
  AMOUNT_1_WITH_FEE: {
    amount: 1,
    expected: 1, // min=50だが、決済金額上限により1円
    description: '手数料あり設定での1円（決済金額上限適用）',
  },
} as const;
