import { type PlatformFeeConfig, type StripeFeeConfig } from './service';

/**
 * Fee Config キャッシュエントリ
 */
interface FeeConfigCacheEntry {
  stripe: StripeFeeConfig;
  platform: PlatformFeeConfig;
  minPayoutAmount: number;
  fetchedAt: number;
  environment: string;
}

// グローバルキャッシュMap（全インスタンスで共有）
const globalCacheMap = new Map<string, FeeConfigCacheEntry>();

/**
 * Fee Config キャッシュ戦略
 *
 * 特徴:
 * - TTL（Time To Live）ベースのキャッシュ
 * - 環境別キャッシュ（本番/開発で設定が異なる可能性）
 * - フェイルセーフ機能（DB接続失敗時の古いキャッシュ使用）
 * - 手動無効化機能
 */
export class FeeConfigCacheStrategy {
  private cache = globalCacheMap;

  /** デフォルトTTL: 10分 */
  private readonly defaultTtl = 1000 * 60 * 10;

  /** フェイルセーフ用の最大キャッシュ保持期間: 1時間 */
  private readonly maxFailsafeAge: number;

  constructor(
    private readonly ttl: number = 1000 * 60 * 10, // 10分
    private readonly environment: string = process.env.NODE_ENV || 'development',
    maxFailsafeAge: number = 1000 * 60 * 60 // 1時間
  ) {
    this.maxFailsafeAge = maxFailsafeAge;
  }

  /**
   * キャッシュキーを生成
   */
  private getCacheKey(): string {
    return `fee_config_${this.environment}`;
  }

  /**
   * キャッシュから設定を取得
   * @param allowExpired 期限切れでも取得を許可するか（フェイルセーフ用）
   * @returns キャッシュされた設定、またはnull
   */
  get(allowExpired = false): FeeConfigCacheEntry | null {
    const key = this.getCacheKey();
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.fetchedAt;

    // 通常のTTLチェック
    if (age <= this.ttl) {
      return entry;
    }

    // フェイルセーフ: 期限切れでも最大保持期間内なら返す
    if (allowExpired && age <= this.maxFailsafeAge) {
      return entry;
    }

    // 最大保持期間も超過した場合のみ削除
    if (age > this.maxFailsafeAge) {
      this.cache.delete(key);
    }

    return null;
  }

  /**
   * キャッシュに設定を保存
   */
  set(config: Omit<FeeConfigCacheEntry, 'fetchedAt' | 'environment'>): void {
    const key = this.getCacheKey();
    const entry: FeeConfigCacheEntry = {
      ...config,
      fetchedAt: Date.now(),
      environment: this.environment,
    };

    this.cache.set(key, entry);
  }

  /**
   * キャッシュを無効化
   * @param environment 特定の環境のみ無効化（省略時は現在の環境）
   */
  invalidate(environment?: string): void {
    if (environment) {
      const key = `fee_config_${environment}`;
      this.cache.delete(key);
    } else {
      const key = this.getCacheKey();
      this.cache.delete(key);
    }
  }

  /**
   * 全キャッシュを無効化
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * キャッシュ統計情報を取得
   */
  getStats(): {
    totalEntries: number;
    currentEnvironmentCached: boolean;
    currentEnvironmentAge?: number;
    environments: string[];
  } {
    const currentKey = this.getCacheKey();
    const currentEntry = this.cache.get(currentKey);

    const environments = Array.from(this.cache.keys())
      .map(key => key.replace('fee_config_', ''));

    return {
      totalEntries: this.cache.size,
      currentEnvironmentCached: !!currentEntry,
      currentEnvironmentAge: currentEntry ? Date.now() - currentEntry.fetchedAt : undefined,
      environments,
    };
  }

  /**
   * 期限切れエントリをクリーンアップ
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.fetchedAt;
      if (age > this.maxFailsafeAge) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * キャッシュの有効性をチェック
   * @returns 有効なキャッシュが存在するか
   */
  isValid(): boolean {
    return this.get() !== null;
  }

  /**
   * フェイルセーフキャッシュの有効性をチェック
   * @returns フェイルセーフとして使用可能なキャッシュが存在するか
   */
  hasFailsafeCache(): boolean {
    return this.get(true) !== null;
  }
}

/**
 * グローバルキャッシュインスタンス
 * アプリケーション全体で共有される
 */
export const globalFeeConfigCache = new FeeConfigCacheStrategy();

/**
 * 環境別のキャッシュ設定
 */
export const CACHE_CONFIG = {
  development: {
    ttl: 1000 * 60 * 5, // 5分（開発時は短め）
    maxFailsafeAge: 1000 * 60 * 30, // 30分
  },
  test: {
    ttl: 1000 * 10, // 10秒（テスト時は非常に短い）
    maxFailsafeAge: 1000 * 60, // 1分
  },
  production: {
    ttl: 1000 * 60 * 10, // 10分
    maxFailsafeAge: 1000 * 60 * 60, // 1時間
  },
} as const;

/**
 * 環境に応じたキャッシュ戦略を作成
 */
export function createEnvironmentCache(environment: string = process.env.NODE_ENV || 'development'): FeeConfigCacheStrategy {
  const config = CACHE_CONFIG[environment as keyof typeof CACHE_CONFIG] || CACHE_CONFIG.development;
  return new FeeConfigCacheStrategy(config.ttl, environment, config.maxFailsafeAge);
}
