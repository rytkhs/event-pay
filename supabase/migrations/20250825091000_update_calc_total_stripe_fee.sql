-- ====================================================================
-- 20250825091000 update calc_total_stripe_fee
--   - 固定手数料を考慮 (ROUND(amount*rate + fixed))
--   - fee_config.stripe_base_rate / stripe_fixed_fee を既定値として参照
--   - オプションで p_base_rate, p_fixed_fee を受け取りテストや将来の料率変更に活用
-- ====================================================================

CREATE OR REPLACE FUNCTION public.calc_total_stripe_fee(
    p_event_id   UUID,
    p_base_rate  NUMERIC DEFAULT NULL,
    p_fixed_fee  INTEGER DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_rate   NUMERIC := COALESCE(p_base_rate,  (SELECT stripe_base_rate  FROM public.fee_config LIMIT 1), 0.036);
    v_fixed  INTEGER := COALESCE(p_fixed_fee,  (SELECT stripe_fixed_fee FROM public.fee_config LIMIT 1), 0);
    v_total_fee INTEGER;
BEGIN
    SELECT COALESCE(SUM(ROUND(p.amount * v_rate + v_fixed)), 0)::INT
      INTO v_total_fee
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    RETURN v_total_fee;
END;
$$;

COMMENT ON FUNCTION public.calc_total_stripe_fee(UUID, NUMERIC, INTEGER) IS 'イベント単位で Stripe 手数料を合計計算（割合 + 固定額を 1 決済毎に丸めて合算）';
