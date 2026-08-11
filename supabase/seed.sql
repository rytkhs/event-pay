-- 開発・テスト環境用の初期データを挿入します
--
-- 実行方法:
--   supabase db reset --seed
-- または
--   psql -h localhost -p 54322 -U postgres -d postgres -f supabase/seed.sql
--

-- =============================================
-- fee_config テーブル - 手数料設定（シングルトン）
-- =============================================
--
-- 手数料設定は1レコードのみ存在するシングルトンテーブルです
-- 既存データがある場合はスキップします

INSERT INTO public.fee_config (
    id,
    stripe_base_rate,
    stripe_fixed_fee,
    platform_fee_rate,
    platform_fixed_fee,
    min_platform_fee,
    max_platform_fee,
    min_payout_amount,
    platform_tax_rate,
    is_tax_included,
    updated_at
) VALUES (
    1,                          -- id: シングルトンID
    0.0360,                     -- stripe_base_rate: Stripe決済手数料 3.6%
    0,                          -- stripe_fixed_fee: Stripe固定手数料 0円
    0.049,                      -- platform_fee_rate: プラットフォーム手数料 4.9%
    50,                         -- platform_fixed_fee: プラットフォーム固定手数料 50円
    0,                          -- min_platform_fee: 最小プラットフォーム手数料 0円
    0,                          -- max_platform_fee: 最大プラットフォーム手数料 0円（無制限）
    1,                          -- min_payout_amount: 最小payout金額 1円
    10.00,                      -- platform_tax_rate: 消費税率 10%
    true,                       -- is_tax_included: 内税計算
    NOW()                       -- updated_at: 現在時刻
) ON CONFLICT (id) DO NOTHING;

-- データ挿入完了メッセージ

DO $$
BEGIN
    RAISE NOTICE '✅ fee_config デフォルト値の挿入が完了しました';
END $$;
