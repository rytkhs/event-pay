import { type SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { FeeConfigCacheStrategy, globalFeeConfigCache } from './cache-strategy';
import { logger } from '@core/logging/app-logger';

/** Stripe 手数料設定 */
export interface StripeFeeConfig {
  /** 決済額に対する割合 (0.039 = 3.9%) */
  baseRate: number;
  /** 1トランザクション当たり固定手数料 (円) */
  fixedFee: number;
}

/** プラットフォーム手数料設定 */
export interface PlatformFeeConfig {
  /** 決済額に対する割合 */
  rate: number;
  /** 1トランザクション当たり固定手数料 (円) */
  fixedFee: number;
  /** 手数料の下限金額 (円) */
  minimumFee: number;
  /** 手数料の上限金額 (円) */
  maximumFee: number;
  /** 消費税率 (0.10 = 10%) */
  taxRate: number;
  /** 内税かどうか (true=内税, false=外税) */
  isTaxIncluded: boolean;
}

/**
 * fee_config を取得・キャッシュするサービス
 */
export class FeeConfigService {
  private supabase: SupabaseClient<Database>;
  private cacheStrategy: FeeConfigCacheStrategy;

  constructor(
    supabaseClient: SupabaseClient<Database>,
    cacheStrategy?: FeeConfigCacheStrategy
  ) {
    this.supabase = supabaseClient;
    this.cacheStrategy = cacheStrategy || globalFeeConfigCache;
  }

  /**
   * fee_config を取得 (キャッシュあり)
   * @param forceRefresh true の場合キャッシュを無視して再取得
   */
  async getConfig(forceRefresh = false): Promise<{
    stripe: StripeFeeConfig;
    platform: PlatformFeeConfig;
    minPayoutAmount: number;
  }> {
    // キャッシュチェック
    if (!forceRefresh) {
      const cached = this.cacheStrategy.get();
      if (cached) {
        logger.debug('Fee config cache hit', { tag: 'cacheHit', service: 'FeeConfigService' });
        return {
          stripe: cached.stripe,
          platform: cached.platform,
          minPayoutAmount: cached.minPayoutAmount,
        };
      }
      logger.debug('Fee config cache miss', { tag: 'cacheMiss', service: 'FeeConfigService' });
    }

    try {
      // DB から取得
      const result = await this.fetchFromDatabase();

      // キャッシュに保存
      this.cacheStrategy.set(result);

      logger.info('Fee config fetched from database and cached', {
        tag: 'fetchSuccess',
        service: 'FeeConfigService'
      });

      return result;
    } catch (error) {
      // DB取得失敗時のフェイルセーフ
      const failsafeCache = this.cacheStrategy.get(true);
      if (failsafeCache) {
        logger.warn('Database fetch failed, using failsafe cache', {
          tag: 'fetchFailed',
          service: 'FeeConfigService',
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          stripe: failsafeCache.stripe,
          platform: failsafeCache.platform,
          minPayoutAmount: failsafeCache.minPayoutAmount,
        };
      }

      // フェイルセーフキャッシュもない場合はエラーを再スロー
      throw error;
    }
  }

  /**
   * データベースから fee_config を取得
   */
  private async fetchFromDatabase(): Promise<{
    stripe: StripeFeeConfig;
    platform: PlatformFeeConfig;
    minPayoutAmount: number;
  }> {
    const { data, error } = await this.supabase
      .from("fee_config")
      .select(
        "stripe_base_rate, stripe_fixed_fee, platform_fee_rate, platform_fixed_fee, min_platform_fee, max_platform_fee, min_payout_amount, platform_tax_rate, is_tax_included"
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`[FeeConfigService] Failed to fetch fee_config from database: ${error.message}`);
    }

    if (!data) {
      throw new Error("[FeeConfigService] No fee_config record found in database. Please insert default values.");
    }

    // null 値チェック
    if (data.stripe_base_rate === null || data.stripe_fixed_fee === null || data.min_payout_amount === null) {
      throw new Error("[FeeConfigService] Critical fee_config fields are null. stripe_base_rate, stripe_fixed_fee, min_payout_amount are required.");
    }

    const stripe: StripeFeeConfig = {
      baseRate: Number(data.stripe_base_rate),
      fixedFee: Number(data.stripe_fixed_fee),
    };

    const platform: PlatformFeeConfig = {
      rate: Number(data.platform_fee_rate ?? 0),
      fixedFee: Number(data.platform_fixed_fee ?? 0),
      minimumFee: Number(data.min_platform_fee ?? 0),
      maximumFee: Number(data.max_platform_fee ?? 0),
      taxRate: Number(data.platform_tax_rate ?? 10) / 100, // DB保存は10.00、使用時は0.10に変換
      isTaxIncluded: data.is_tax_included ?? true,
    };

    return { stripe, platform, minPayoutAmount: Number(data.min_payout_amount) };
  }

  /**
   * キャッシュを無効化
   */
  invalidateCache(): void {
    this.cacheStrategy.invalidate();
  }

  /**
   * キャッシュ統計情報を取得
   */
  getCacheStats() {
    return this.cacheStrategy.getStats();
  }
}
