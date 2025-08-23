-- Update calc_total_stripe_fee to prefer stored fee per payment with fallback to rate-based approximation
BEGIN;

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
    SELECT COALESCE(SUM(
      COALESCE(p.stripe_balance_transaction_fee, ROUND(p.amount * v_rate + v_fixed))
    ), 0)::INT
      INTO v_total_fee
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    RETURN v_total_fee;
END;
$$;

COMMENT ON FUNCTION public.calc_total_stripe_fee(UUID, NUMERIC, INTEGER) IS 'Prefer stored balance_transaction fee per payment; fallback to rate+fixed if missing.';

COMMIT;
