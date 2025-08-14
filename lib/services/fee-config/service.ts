import { type SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

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

/** fee_config テーブルの定義 (型生成対象外なので簡易定義) */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type _FeeConfigRow = {
  stripe_base_rate: number | null;
  stripe_fixed_fee: number | null;
  platform_fee_rate: number | null;
  platform_fixed_fee: number | null;
  min_platform_fee: number | null;
  max_platform_fee: number | null;
  min_payout_amount: number | null;
};

// デフォルト値は削除 - fee_config テーブルから必須で取得

/**
 * fee_config を取得・キャッシュするサービス
 */
export class FeeConfigService {
  private supabase: SupabaseClient<Database>;
  private cache?: { stripe: StripeFeeConfig; platform: PlatformFeeConfig; minPayoutAmount: number };
  private fetchedAt?: number;
  /** キャッシュ有効期間 (ms) */
  private cacheTtl = 1000 * 60 * 10; // 10分

  constructor(supabaseClient: SupabaseClient<Database>) {
    this.supabase = supabaseClient;
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
    const now = Date.now();
    if (!forceRefresh && this.cache && this.fetchedAt && now - this.fetchedAt < this.cacheTtl) {
      return this.cache;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from("fee_config")
      .select(
        "stripe_base_rate, stripe_fixed_fee, platform_fee_rate, platform_fixed_fee, min_platform_fee, max_platform_fee, min_payout_amount"
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      // DB の取得に失敗した場合はフォールバックではなく強制エラー
      throw new Error(`[FeeConfigService] Failed to fetch fee_config from database: ${error.message}`);
    }

    // fee_config データが存在しない場合は強制エラー
    if (!data) {
      throw new Error("[FeeConfigService] No fee_config record found in database. Please insert default values.");
    }

    // null 値チェックして強制エラー
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

    const result = { stripe, platform, minPayoutAmount: Number(data.min_payout_amount) };
    this.cache = result;
    this.fetchedAt = now;
    return result;
  }
}
