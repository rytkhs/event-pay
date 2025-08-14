-- ====================================================================
-- 20250825091500 update get_min_payout_amount
--   - fee_config.min_payout_amount を参照し、設定が無ければ 100 を返す
--   - 既存のハードコード版を置き換え
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_min_payout_amount()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((SELECT min_payout_amount FROM public.fee_config LIMIT 1), 100);
$$;

COMMENT ON FUNCTION public.get_min_payout_amount() IS '最小送金金額（円）を返すユーティリティ関数。fee_config に設定が無い場合はデフォルト 100 円。';
