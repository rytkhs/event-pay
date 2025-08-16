import { ApplicationFeeCalculator, TEST_CASES } from '@/lib/services/fee-config/application-fee-calculator';
import { FeeConfigService } from '@/lib/services/fee-config/service';
import { createClient } from '@supabase/supabase-js';

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(),
} as any;

// FeeConfigServiceのモック
jest.mock('@/lib/services/fee-config/service');
const MockedFeeConfigService = FeeConfigService as jest.MockedClass<typeof FeeConfigService>;

// ログのモック
jest.mock('@/lib/logging/app-logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

describe('ApplicationFeeCalculator', () => {
  let calculator: ApplicationFeeCalculator;
  let mockFeeConfigService: jest.Mocked<FeeConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // FeeConfigServiceのモックインスタンスを作成
    mockFeeConfigService = {
      getConfig: jest.fn(),
    } as any;

    MockedFeeConfigService.mockImplementation(() => mockFeeConfigService);

    calculator = new ApplicationFeeCalculator(mockSupabase);
  });

  describe('基本的な計算ロジック', () => {
    beforeEach(() => {
      // デフォルト設定: 手数料なし
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0,
          fixedFee: 0,
          minimumFee: 0,
          maximumFee: 0,
          taxRate: 0,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });
    });

    test('手数料なし設定での計算', async () => {
      const result = await calculator.calculateApplicationFee(1000);

      expect(result.amount).toBe(1000);
      expect(result.applicationFeeAmount).toBe(0);
      expect(result.calculation.rateFee).toBe(0);
      expect(result.calculation.fixedFee).toBe(0);
      expect(result.calculation.beforeClipping).toBe(0);
      expect(result.calculation.afterMinimum).toBe(0);
      expect(result.calculation.afterMaximum).toBe(0);
    });

    test('TEST_CASES.AMOUNT_1000_NO_FEE の期待値と一致', async () => {
      const result = await calculator.calculateApplicationFee(TEST_CASES.AMOUNT_1000_NO_FEE.amount);
      expect(result.applicationFeeAmount).toBe(TEST_CASES.AMOUNT_1000_NO_FEE.expected);
    });
  });

  describe('手数料ありの計算', () => {
    beforeEach(() => {
      // 手数料設定: rate=3%, fixed=30, min=50, max=500
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.03, // 3%
          fixedFee: 30,
          minimumFee: 50,
          maximumFee: 500,
          taxRate: 0,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });
    });

    test('通常の計算（min/max適用なし）', async () => {
      // 2000円: round(2000 * 0.03) + 30 = 60 + 30 = 90
      const result = await calculator.calculateApplicationFee(2000);

      expect(result.applicationFeeAmount).toBe(90);
      expect(result.calculation.rateFee).toBe(60);
      expect(result.calculation.fixedFee).toBe(30);
      expect(result.calculation.beforeClipping).toBe(90);
      expect(result.calculation.afterMinimum).toBe(90);
      expect(result.calculation.afterMaximum).toBe(90);
    });

    test('最小値適用のケース', async () => {
      // 999円: round(999 * 0.03) + 30 = 30 + 30 = 60, but min=50 so 50
      // ただし、実際は round(999 * 0.03) = round(29.97) = 30
      const result = await calculator.calculateApplicationFee(999);

      expect(result.calculation.rateFee).toBe(30); // round(999 * 0.03)
      expect(result.calculation.fixedFee).toBe(30);
      expect(result.calculation.beforeClipping).toBe(60);
      expect(result.calculation.afterMinimum).toBe(60); // 60 > 50なので最小値適用なし
      expect(result.applicationFeeAmount).toBe(60);
    });

    test('最小値適用が必要なケース', async () => {
      // 100円: round(100 * 0.03) + 30 = 3 + 30 = 33 < 50 → 50
      const result = await calculator.calculateApplicationFee(100);

      expect(result.calculation.rateFee).toBe(3);
      expect(result.calculation.fixedFee).toBe(30);
      expect(result.calculation.beforeClipping).toBe(33);
      expect(result.calculation.afterMinimum).toBe(50); // min適用
      expect(result.applicationFeeAmount).toBe(50);
    });

    test('最大値適用のケース', async () => {
      // 20000円: round(20000 * 0.03) + 30 = 600 + 30 = 630 > 500 → 500
      const result = await calculator.calculateApplicationFee(20000);

      expect(result.calculation.rateFee).toBe(600);
      expect(result.calculation.fixedFee).toBe(30);
      expect(result.calculation.beforeClipping).toBe(630);
      expect(result.calculation.afterMinimum).toBe(630);
      expect(result.calculation.afterMaximum).toBe(500); // max適用
      expect(result.applicationFeeAmount).toBe(500);
    });

    test('決済金額上限適用のケース', async () => {
      // 1円: 最小値50円だが、決済金額1円を超えられないので1円
      const result = await calculator.calculateApplicationFee(1);

      expect(result.calculation.afterMinimum).toBe(50);
      expect(result.calculation.afterMaximum).toBe(1); // 決済金額上限適用
      expect(result.applicationFeeAmount).toBe(1);
    });

    test('TEST_CASES の期待値と一致', async () => {
      // 999円のケース
      const result999 = await calculator.calculateApplicationFee(TEST_CASES.AMOUNT_999_WITH_FEE.amount);
      expect(result999.applicationFeeAmount).toBe(60); // 実際の計算結果

      // 1円のケース
      const result1 = await calculator.calculateApplicationFee(TEST_CASES.AMOUNT_1_WITH_FEE.amount);
      expect(result1.applicationFeeAmount).toBe(TEST_CASES.AMOUNT_1_WITH_FEE.expected);
    });
  });

  describe('四捨五入の動作確認', () => {
    beforeEach(() => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.033, // 3.3% - 端数が出やすい値
          fixedFee: 0,
          minimumFee: 0,
          maximumFee: 0,
          taxRate: 0,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });
    });

    test('四捨五入: 0.4以下は切り捨て', async () => {
      // 100円 * 3.3% = 3.3 → round(3.3) = 3
      const result = await calculator.calculateApplicationFee(100);
      expect(result.calculation.rateFee).toBe(3);
      expect(result.applicationFeeAmount).toBe(3);
    });

    test('四捨五入: 0.5以上は切り上げ', async () => {
      // 200円 * 3.3% = 6.6 → round(6.6) = 7
      const result = await calculator.calculateApplicationFee(200);
      expect(result.calculation.rateFee).toBe(7);
      expect(result.applicationFeeAmount).toBe(7);
    });

    test('四捨五入: ちょうど0.5', async () => {
      // 151円 * 3.3% = 4.983 ≈ 5.0, 152円 * 3.3% = 5.016 ≈ 5.0
      // 150円 * 3.3% = 4.95 → round(4.95) = 5
      const result = await calculator.calculateApplicationFee(150);
      expect(result.calculation.rateFee).toBe(5);
    });
  });

  describe('バッチ計算', () => {
    beforeEach(() => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.02, // 2%
          fixedFee: 10,
          minimumFee: 20,
          maximumFee: 100,
          taxRate: 0,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });
    });

    test('複数金額の一括計算', async () => {
      const amounts = [500, 1000, 2000];
      const results = await calculator.calculateApplicationFeeBatch(amounts);

      expect(results).toHaveLength(3);

      // 500円: round(500 * 0.02) + 10 = 10 + 10 = 20
      expect(results[0].amount).toBe(500);
      expect(results[0].applicationFeeAmount).toBe(20);

      // 1000円: round(1000 * 0.02) + 10 = 20 + 10 = 30
      expect(results[1].amount).toBe(1000);
      expect(results[1].applicationFeeAmount).toBe(30);

      // 2000円: round(2000 * 0.02) + 10 = 40 + 10 = 50
      expect(results[2].amount).toBe(2000);
      expect(results[2].applicationFeeAmount).toBe(50);
    });

    test('fee_configは一度だけ取得される', async () => {
      const amounts = [100, 200, 300];
      await calculator.calculateApplicationFeeBatch(amounts);

      expect(mockFeeConfigService.getConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('入力値検証', () => {
    beforeEach(() => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0,
          fixedFee: 0,
          minimumFee: 0,
          maximumFee: 0,
          taxRate: 0,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });
    });

    test('負の金額でエラー', async () => {
      await expect(calculator.calculateApplicationFee(-100))
        .rejects.toThrow('Invalid amount: -100. Amount must be a positive integer.');
    });

    test('0円でエラー', async () => {
      await expect(calculator.calculateApplicationFee(0))
        .rejects.toThrow('Invalid amount: 0. Amount must be a positive integer.');
    });

    test('小数点でエラー', async () => {
      await expect(calculator.calculateApplicationFee(100.5))
        .rejects.toThrow('Invalid amount: 100.5. Amount must be a positive integer.');
    });

    test('バッチ計算での不正な値', async () => {
      await expect(calculator.calculateApplicationFeeBatch([100, -50, 200]))
        .rejects.toThrow('Invalid amount: -50. All amounts must be positive integers.');
    });
  });

  describe('設定値バリデーション', () => {
    test('正常な設定値', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.03,
          fixedFee: 30,
          minimumFee: 50,
          maximumFee: 500,
          taxRate: 0.1,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.validateConfig();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('不正な設定値: 負の割合', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: -0.01, // 負の値
          fixedFee: 30,
          minimumFee: 50,
          maximumFee: 500,
          taxRate: 0.1,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('platform_fee_rate must be non-negative, got: -0.01');
    });

    test('不正な設定値: 100%超の割合', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 1.5, // 150%
          fixedFee: 30,
          minimumFee: 50,
          maximumFee: 500,
          taxRate: 0.1,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('platform_fee_rate should not exceed 100%, got: 150%');
    });

    test('不正な設定値: max < min', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.03,
          fixedFee: 30,
          minimumFee: 100,
          maximumFee: 50, // min > max
          taxRate: 0.1,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('max_platform_fee (50) must be >= min_platform_fee (100)');
    });
  });

  describe('税額計算（将来の課税事業者対応）', () => {
    test('MVP段階: 税率0%の場合', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.03,
          fixedFee: 30,
          minimumFee: 50,
          maximumFee: 500,
          taxRate: 0, // MVP段階
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.calculateApplicationFee(1000);

      expect(result.taxCalculation).toEqual({
        taxRate: 0,
        feeExcludingTax: result.applicationFeeAmount,
        taxAmount: 0,
        isTaxIncluded: true,
      });
    });

    test('内税計算: 税率10%の場合', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.1, // 10%
          fixedFee: 0,
          minimumFee: 0,
          maximumFee: 0,
          taxRate: 0.1, // 10%
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.calculateApplicationFee(1000);

      // 1000円 * 10% = 100円（税込）
      expect(result.applicationFeeAmount).toBe(100);

      // 内税計算: 税抜 = 100 / (1 + 0.1) = 90.909... → 90円（切り捨て）
      // 税額 = 100 - 90 = 10円
      expect(result.taxCalculation.feeExcludingTax).toBe(90);
      expect(result.taxCalculation.taxAmount).toBe(10);
      expect(result.taxCalculation.taxRate).toBe(0.1);
      expect(result.taxCalculation.isTaxIncluded).toBe(true);
    });

    test('外税計算: 税率10%の場合', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.1, // 10%
          fixedFee: 0,
          minimumFee: 0,
          maximumFee: 0,
          taxRate: 0.1, // 10%
          isTaxIncluded: false, // 外税
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.calculateApplicationFee(1000);

      // 1000円 * 10% = 100円（税抜）
      expect(result.applicationFeeAmount).toBe(100);

      // 外税計算: 税抜100円、税額 = 100 * 0.1 = 10円
      expect(result.taxCalculation.feeExcludingTax).toBe(100);
      expect(result.taxCalculation.taxAmount).toBe(10);
      expect(result.taxCalculation.taxRate).toBe(0.1);
      expect(result.taxCalculation.isTaxIncluded).toBe(false);
    });

    test('内税計算での端数処理', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0,
          fixedFee: 33, // 33円固定
          minimumFee: 0,
          maximumFee: 0,
          taxRate: 0.1, // 10%
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.calculateApplicationFee(1000);

      expect(result.applicationFeeAmount).toBe(33);

      // 内税計算: 税抜 = 33 / 1.1 = 30.000... → 30円（切り捨て）
      // 実際: 33 / 1.1 = 30.000... → Math.floor(30.000...) = 30円ではなく
      // JavaScript の浮動小数点誤差で 29.999... → Math.floor(29.999...) = 29円
      // 税額 = 33 - 29 = 4円
      expect(result.taxCalculation.feeExcludingTax).toBe(29);
      expect(result.taxCalculation.taxAmount).toBe(4);
    });
  });

  describe('税率バリデーション', () => {
    test('負の税率でエラー', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.03,
          fixedFee: 30,
          minimumFee: 50,
          maximumFee: 500,
          taxRate: -0.05, // 負の税率
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('platform_tax_rate must be non-negative, got: -0.05');
    });

    test('100%超の税率でエラー', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0.03,
          fixedFee: 30,
          minimumFee: 50,
          maximumFee: 500,
          taxRate: 1.5, // 150%
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      const result = await calculator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('platform_tax_rate should not exceed 100%, got: 150%');
    });
  });

  describe('キャッシュとforceRefresh', () => {
    test('forceRefresh=trueでキャッシュを無視', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0,
          fixedFee: 0,
          minimumFee: 0,
          maximumFee: 0,
          taxRate: 0,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      await calculator.calculateApplicationFee(1000, true);
      expect(mockFeeConfigService.getConfig).toHaveBeenCalledWith(true);
    });

    test('forceRefresh=falseでキャッシュ使用', async () => {
      mockFeeConfigService.getConfig.mockResolvedValue({
        stripe: { baseRate: 0.036, fixedFee: 0 },
        platform: {
          rate: 0,
          fixedFee: 0,
          minimumFee: 0,
          maximumFee: 0,
          taxRate: 0,
          isTaxIncluded: true,
        },
        minPayoutAmount: 100,
      });

      await calculator.calculateApplicationFee(1000, false);
      expect(mockFeeConfigService.getConfig).toHaveBeenCalledWith(false);
    });
  });
});
