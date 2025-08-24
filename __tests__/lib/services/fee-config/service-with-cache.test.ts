import { FeeConfigService } from '@/lib/services/fee-config/service';
import { FeeConfigCacheStrategy } from '@/lib/services/fee-config/cache-strategy';

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(),
} as any;

describe('FeeConfigService with Cache Strategy', () => {
  let service: FeeConfigService;
  let mockCacheStrategy: jest.Mocked<FeeConfigCacheStrategy>;
  let mockSupabaseQuery: any;

  const mockDbData = {
    stripe_base_rate: 0.036,
    stripe_fixed_fee: 0,
    platform_fee_rate: 0.03,
    platform_fixed_fee: 30,
    min_platform_fee: 50,
    max_platform_fee: 500,
    min_payout_amount: 100,
  };

  const expectedConfig = {
    stripe: { baseRate: 0.036, fixedFee: 0 },
    platform: {
      rate: 0.03,
      fixedFee: 30,
      minimumFee: 50,
      maximumFee: 500,
    },
    minPayoutAmount: 100,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // キャッシュ戦略のモック
    mockCacheStrategy = {
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
      invalidateAll: jest.fn(),
      getStats: jest.fn(),
      cleanup: jest.fn(),
      isValid: jest.fn(),
      hasFailsafeCache: jest.fn(),
    } as any;

    // Supabaseクエリのモック
    mockSupabaseQuery = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };

    mockSupabase.from.mockReturnValue(mockSupabaseQuery);

    service = new FeeConfigService(mockSupabase, mockCacheStrategy);
  });

  describe('キャッシュヒット時の動作', () => {
    test('有効なキャッシュがある場合はDBアクセスしない', async () => {
      // キャッシュヒットをシミュレート
      mockCacheStrategy.get.mockReturnValue({
        ...expectedConfig,
        fetchedAt: Date.now(),
        environment: 'test',
      });

      const result = await service.getConfig();

      expect(result).toEqual(expectedConfig);
      expect(mockCacheStrategy.get).toHaveBeenCalledWith();
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(mockCacheStrategy.set).not.toHaveBeenCalled();
    });

    test('forceRefresh=trueの場合はキャッシュを無視', async () => {
      // キャッシュがあってもforceRefreshでDBアクセス
      mockCacheStrategy.get.mockReturnValue({
        ...expectedConfig,
        fetchedAt: Date.now(),
        environment: 'test',
      });

      mockSupabaseQuery.maybeSingle.mockResolvedValue({
        data: mockDbData,
        error: null,
      });

      const result = await service.getConfig(true);

      expect(result).toEqual(expectedConfig);
      expect(mockCacheStrategy.get).not.toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalledWith('fee_config');
      expect(mockCacheStrategy.set).toHaveBeenCalledWith(expectedConfig);
    });
  });

  describe('キャッシュミス時の動作', () => {
    test('キャッシュがない場合はDBから取得してキャッシュに保存', async () => {
      // キャッシュミス
      mockCacheStrategy.get.mockReturnValue(null);

      // DB取得成功
      mockSupabaseQuery.maybeSingle.mockResolvedValue({
        data: mockDbData,
        error: null,
      });

      const result = await service.getConfig();

      expect(result).toEqual(expectedConfig);
      expect(mockCacheStrategy.get).toHaveBeenCalledWith();
      expect(mockSupabase.from).toHaveBeenCalledWith('fee_config');
      expect(mockSupabaseQuery.select).toHaveBeenCalledWith(
        'stripe_base_rate, stripe_fixed_fee, platform_fee_rate, platform_fixed_fee, min_platform_fee, max_platform_fee, min_payout_amount'
      );
      expect(mockCacheStrategy.set).toHaveBeenCalledWith(expectedConfig);
    });
  });

  describe('フェイルセーフ機能', () => {
    test('DB取得失敗時にフェイルセーフキャッシュを使用', async () => {
      // キャッシュミス
      mockCacheStrategy.get.mockReturnValue(null);

      // DB取得失敗
      mockSupabaseQuery.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Connection failed' },
      });

      // フェイルセーフキャッシュあり
      mockCacheStrategy.get.mockReturnValueOnce(null) // 通常キャッシュなし
        .mockReturnValueOnce({ // フェイルセーフキャッシュあり
          ...expectedConfig,
          fetchedAt: Date.now() - 1000 * 60 * 20, // 20分前
          environment: 'test',
        });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await service.getConfig();

      expect(result).toEqual(expectedConfig);
      expect(mockCacheStrategy.get).toHaveBeenCalledTimes(2);
      expect(mockCacheStrategy.get).toHaveBeenNthCalledWith(1); // 通常キャッシュチェック
      expect(mockCacheStrategy.get).toHaveBeenNthCalledWith(2, true); // フェイルセーフキャッシュチェック
      expect(consoleSpy).toHaveBeenCalledWith(
        '[FeeConfigService] Database fetch failed, using failsafe cache:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('DB取得失敗かつフェイルセーフキャッシュもない場合はエラー', async () => {
      // キャッシュミス
      mockCacheStrategy.get.mockReturnValue(null);

      // DB取得失敗
      const dbError = new Error('Connection failed');
      mockSupabaseQuery.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Connection failed' },
      });

      await expect(service.getConfig()).rejects.toThrow(
        '[FeeConfigService] Failed to fetch fee_config from database: Connection failed'
      );

      expect(mockCacheStrategy.get).toHaveBeenCalledTimes(2);
      expect(mockCacheStrategy.set).not.toHaveBeenCalled();
    });
  });

  describe('データベース取得エラーハンドリング', () => {
    beforeEach(() => {
      mockCacheStrategy.get.mockReturnValue(null); // キャッシュなし
    });

    test('データが存在しない場合のエラー', async () => {
      mockSupabaseQuery.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(service.getConfig()).rejects.toThrow(
        '[FeeConfigService] No fee_config record found in database. Please insert default values.'
      );
    });

    test('必須フィールドがnullの場合のエラー', async () => {
      mockSupabaseQuery.maybeSingle.mockResolvedValue({
        data: {
          ...mockDbData,
          stripe_base_rate: null, // 必須フィールドがnull
        },
        error: null,
      });

      await expect(service.getConfig()).rejects.toThrow(
        '[FeeConfigService] Critical fee_config fields are null. stripe_base_rate, stripe_fixed_fee, min_payout_amount are required.'
      );
    });

    test('オプショナルフィールドがnullでも正常動作', async () => {
      mockSupabaseQuery.maybeSingle.mockResolvedValue({
        data: {
          ...mockDbData,
          platform_fee_rate: null,
          platform_fixed_fee: null,
          min_platform_fee: null,
          max_platform_fee: null,
        },
        error: null,
      });

      const result = await service.getConfig();

      expect(result.platform).toEqual({
        rate: 0,
        fixedFee: 0,
        minimumFee: 0,
        maximumFee: 0,
      });
    });
  });

  describe('キャッシュ管理メソッド', () => {
    test('invalidateCache() でキャッシュを無効化', () => {
      service.invalidateCache();
      expect(mockCacheStrategy.invalidate).toHaveBeenCalledWith();
    });

    test('getCacheStats() で統計情報を取得', () => {
      const mockStats = {
        totalEntries: 1,
        currentEnvironmentCached: true,
        currentEnvironmentAge: 30000,
        environments: ['test'],
      };

      mockCacheStrategy.getStats.mockReturnValue(mockStats);

      const stats = service.getCacheStats();
      expect(stats).toEqual(mockStats);
      expect(mockCacheStrategy.getStats).toHaveBeenCalledWith();
    });
  });

  describe('数値変換の確認', () => {
    test('文字列数値が正しく変換される', async () => {
      mockCacheStrategy.get.mockReturnValue(null);

      // 文字列として返されるケース
      mockSupabaseQuery.maybeSingle.mockResolvedValue({
        data: {
          stripe_base_rate: '0.036',
          stripe_fixed_fee: '0',
          platform_fee_rate: '0.03',
          platform_fixed_fee: '30',
          min_platform_fee: '50',
          max_platform_fee: '500',
          min_payout_amount: '100',
        },
        error: null,
      });

      const result = await service.getConfig();

      expect(result.stripe.baseRate).toBe(0.036);
      expect(result.stripe.fixedFee).toBe(0);
      expect(result.platform.rate).toBe(0.03);
      expect(result.platform.fixedFee).toBe(30);
      expect(result.platform.minimumFee).toBe(50);
      expect(result.platform.maximumFee).toBe(500);
      expect(result.minPayoutAmount).toBe(100);
    });
  });
});
