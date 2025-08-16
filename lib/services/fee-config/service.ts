import { type SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { FeeConfigCacheStrategy, globalFeeConfigCache } from './cache-strategy';

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
        return {
          stripe: cached.stripe,
          platform: cached.platform,
          minPayoutAmount: cached.minPayoutAmount,
        };
      }
    }

    try {
      // DB から取得
      const result = await this.fetchFromDatabase();

      // キャッシュに保存
      this.cacheStrategy.set(result);

      return result;
    } catch (error) {
      // DB取得失敗時のフェイルセーフ
      const failsafeCache = this.cacheStrategy.get(true);
      if (failsafeCache) {
        console.warn('[FeeConfigService] Database fetch failed, using failsafe cache:', error);
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
        "stripe_base_rate, stripe_fixed_fee, platform_fee_rate, platform_fixed_fee, min_platform_fee, max_platform_fee, min_payout_amount"
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
