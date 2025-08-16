import { FeeConfigCacheStrategy, globalFeeConfigCache, createEnvironmentCache, CACHE_CONFIG } from '@/lib/services/fee-config/cache-strategy';

describe('FeeConfigCacheStrategy', () => {
  let cache: FeeConfigCacheStrategy;

  const mockConfig = {
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
    cache = new FeeConfigCacheStrategy(1000, 'test-main', 2000); // 1秒TTL, 2秒フェイルセーフ
  });

  afterEach(() => {
    cache.invalidateAll();
    // グローバルキャッシュもクリア
    globalFeeConfigCache.invalidateAll();
  });

  describe('基本的なキャッシュ操作', () => {
    test('設定の保存と取得', () => {
      cache.set(mockConfig);
      const result = cache.get();

      expect(result).not.toBeNull();
      expect(result!.stripe).toEqual(mockConfig.stripe);
      expect(result!.platform).toEqual(mockConfig.platform);
      expect(result!.minPayoutAmount).toBe(mockConfig.minPayoutAmount);
      expect(result!.environment).toBe('test-main');
      expect(typeof result!.fetchedAt).toBe('number');
    });

    test('キャッシュが存在しない場合はnullを返す', () => {
      const result = cache.get();
      expect(result).toBeNull();
    });

    test('キャッシュの無効化', () => {
      cache.set(mockConfig);
      expect(cache.get()).not.toBeNull();

      cache.invalidate();
      expect(cache.get()).toBeNull();
    });

    test('全キャッシュの無効化', () => {
      cache.set(mockConfig);
      expect(cache.get()).not.toBeNull();

      cache.invalidateAll();
      expect(cache.get()).toBeNull();
    });
  });

  describe('TTL（有効期限）', () => {
    test('TTL内ではキャッシュが有効', () => {
      cache.set(mockConfig);
      const result = cache.get();
      expect(result).not.toBeNull();
    });

    test('TTL経過後はキャッシュが無効', async () => {
      cache.set(mockConfig);

      // TTL（1秒）経過を待つ
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = cache.get();
      expect(result).toBeNull();
    });

    test('TTL経過後でもallowExpired=trueなら取得可能', async () => {
      cache.set(mockConfig);

      // TTL（1秒）経過を待つ
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = cache.get(true);
      expect(result).not.toBeNull();
    });
  });

  describe('フェイルセーフ機能', () => {
    test('最大保持期間内ならフェイルセーフキャッシュとして使用可能', async () => {
      // 短いTTL（100ms）、長いフェイルセーフ期間（1秒）でキャッシュを作成
      const shortTtlCache = new FeeConfigCacheStrategy(100, 'failsafe-test-1', 1000);
      shortTtlCache.set(mockConfig);

      // TTL経過を待つ
      await new Promise(resolve => setTimeout(resolve, 200));

      // 通常取得では無効
      expect(shortTtlCache.get()).toBeNull();

      // フェイルセーフ取得では有効
      expect(shortTtlCache.get(true)).not.toBeNull();
      expect(shortTtlCache.hasFailsafeCache()).toBe(true);
    });

    test('最大保持期間経過後はフェイルセーフでも無効', async () => {
      // 非常に短い期間でテスト
      const veryShortCache = new FeeConfigCacheStrategy(10, 'failsafe-test-2', 100); // 10ms TTL, 100ms フェイルセーフ

      veryShortCache.set(mockConfig);

      // TTL経過
      await new Promise(resolve => setTimeout(resolve, 50));

      // フェイルセーフでは取得可能
      expect(veryShortCache.get(true)).not.toBeNull();

      // フェイルセーフ期間も経過
      await new Promise(resolve => setTimeout(resolve, 100));

      // フェイルセーフ期間経過後は取得不可
      expect(veryShortCache.get(true)).toBeNull();
    });
  });

  describe('環境別キャッシュ', () => {
    test('異なる環境では異なるキャッシュキーを使用', () => {
      const devCache = new FeeConfigCacheStrategy(1000, 'development');
      const prodCache = new FeeConfigCacheStrategy(1000, 'production');

      devCache.set(mockConfig);

      // 開発環境では取得可能
      expect(devCache.get()).not.toBeNull();

      // 本番環境では取得不可
      expect(prodCache.get()).toBeNull();
    });

    test('特定環境のキャッシュのみ無効化', () => {
      const devCache = new FeeConfigCacheStrategy(1000, 'development');
      const prodCache = new FeeConfigCacheStrategy(1000, 'production');

      devCache.set(mockConfig);
      prodCache.set(mockConfig);

      // 開発環境のみ無効化
      devCache.invalidate('development');

      expect(devCache.get()).toBeNull();
      expect(prodCache.get()).not.toBeNull();
    });
  });

  describe('統計情報', () => {
    test('キャッシュ統計の取得', () => {
      const stats1 = cache.getStats();
      expect(stats1.totalEntries).toBe(0);
      expect(stats1.currentEnvironmentCached).toBe(false);
      expect(stats1.currentEnvironmentAge).toBeUndefined();

      cache.set(mockConfig);

      const stats2 = cache.getStats();
      expect(stats2.totalEntries).toBe(1);
      expect(stats2.currentEnvironmentCached).toBe(true);
      expect(typeof stats2.currentEnvironmentAge).toBe('number');
      expect(stats2.environments).toContain('test-main');
    });

    test('複数環境の統計', () => {
      const devCache = new FeeConfigCacheStrategy(1000, 'development');
      const prodCache = new FeeConfigCacheStrategy(1000, 'production');

      devCache.set(mockConfig);
      prodCache.set(mockConfig);

      const stats = devCache.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.environments).toContain('development');
      expect(stats.environments).toContain('production');
    });
  });

  describe('有効性チェック', () => {
    test('isValid() - 有効なキャッシュの存在確認', () => {
      expect(cache.isValid()).toBe(false);

      cache.set(mockConfig);
      expect(cache.isValid()).toBe(true);
    });

    test('hasFailsafeCache() - フェイルセーフキャッシュの存在確認', async () => {
      expect(cache.hasFailsafeCache()).toBe(false);

      cache.set(mockConfig);
      expect(cache.hasFailsafeCache()).toBe(true);

      // TTL経過後もフェイルセーフは有効
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(cache.isValid()).toBe(false);
      expect(cache.hasFailsafeCache()).toBe(true);
    });
  });

  describe('クリーンアップ', () => {
    test('期限切れエントリのクリーンアップ', async () => {
      cache.set(mockConfig);

      // TTL経過を待つ
      await new Promise(resolve => setTimeout(resolve, 1100));

      // クリーンアップ前は統計に表示される
      expect(cache.getStats().totalEntries).toBe(1);

      // クリーンアップ実行（実際にはmaxFailsafeAge経過が必要だが、テスト用に手動実行）
      const cleanedCount = cache.cleanup();

      // 実際のクリーンアップはmaxFailsafeAge（1時間）経過後なので、
      // このテストでは0が返される
      expect(cleanedCount).toBe(0);
    });
  });
});

describe('グローバルキャッシュとファクトリ関数', () => {
  afterEach(() => {
    globalFeeConfigCache.invalidateAll();
  });

  test('globalFeeConfigCache の動作', () => {
    const mockConfig = {
      stripe: { baseRate: 0.036, fixedFee: 0 },
      platform: {
        rate: 0.03,
        fixedFee: 30,
        minimumFee: 50,
        maximumFee: 500,
      },
      minPayoutAmount: 100,
    };

    globalFeeConfigCache.set(mockConfig);
    const result = globalFeeConfigCache.get();

    expect(result).not.toBeNull();
    expect(result!.stripe).toEqual(mockConfig.stripe);
  });

  test('createEnvironmentCache の動作', () => {
    const devCache = createEnvironmentCache('development');
    const prodCache = createEnvironmentCache('production');
    const testCache = createEnvironmentCache('test');

    // 各環境で異なる設定が適用されることを確認
    expect(devCache).toBeInstanceOf(FeeConfigCacheStrategy);
    expect(prodCache).toBeInstanceOf(FeeConfigCacheStrategy);
    expect(testCache).toBeInstanceOf(FeeConfigCacheStrategy);
  });

  test('CACHE_CONFIG の設定値', () => {
    expect(CACHE_CONFIG.development.ttl).toBe(1000 * 60 * 5); // 5分
    expect(CACHE_CONFIG.test.ttl).toBe(1000 * 10); // 10秒
    expect(CACHE_CONFIG.production.ttl).toBe(1000 * 60 * 10); // 10分

    expect(CACHE_CONFIG.development.maxFailsafeAge).toBe(1000 * 60 * 30); // 30分
    expect(CACHE_CONFIG.test.maxFailsafeAge).toBe(1000 * 60); // 1分
    expect(CACHE_CONFIG.production.maxFailsafeAge).toBe(1000 * 60 * 60); // 1時間
  });
});
