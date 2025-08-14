-- ====================================================================
-- 20250825090000 update fee_config schema
-- - rename stripe_fee_rate -> stripe_base_rate (呼称統一)
-- - add    min_payout_amount INTEGER NOT NULL DEFAULT 100
-- ====================================================================

-- 1. 既存列のリネーム
ALTER TABLE IF EXISTS public.fee_config
    RENAME COLUMN stripe_fee_rate TO stripe_base_rate;

-- 2. 最小送金金額を追加（デフォルト 100 円）
ALTER TABLE IF EXISTS public.fee_config
    ADD COLUMN IF NOT EXISTS min_payout_amount INTEGER NOT NULL DEFAULT 100;

-- 3. updated_at を更新する trigger があれば自動更新される想定。

-- 4. 既存行の DEFAULT 適用確認（PostgreSQL は ADD COLUMN NOT NULL DEFAULT で全行値を埋める）。

-- 5. ドキュメント
COMMENT ON COLUMN public.fee_config.stripe_base_rate    IS 'Stripe 決済手数料の割合 (0.039 = 3.9%)';
COMMENT ON COLUMN public.fee_config.stripe_fixed_fee    IS 'Stripe 決済手数料の固定額 (円)';
COMMENT ON COLUMN public.fee_config.min_payout_amount   IS '最小送金金額 (円)';
