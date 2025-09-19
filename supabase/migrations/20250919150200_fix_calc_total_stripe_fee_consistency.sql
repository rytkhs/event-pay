-- Fix calc_total_stripe_fee function for consistency with other settlement functions
-- Change status condition from 'paid' only to IN ('paid', 'refunded') to include refunded payments
-- This ensures stripe fees are calculated consistently across all settlement functions

CREATE OR REPLACE FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric DEFAULT NULL::numeric, "p_fixed_fee" integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE "plpgsql"
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
       AND p.status IN ('paid', 'refunded'); -- 修正: 一貫性のためrefundedも含める

    RETURN v_total_fee;
END;
$$;

-- Grant permissions
GRANT ALL ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) TO "service_role";

-- Update comment to reflect the change
COMMENT ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) IS 'Calculate total Stripe fees for an event, including both paid and refunded payments. Prefers stored balance_transaction fee per payment; fallback to rate+fixed calculation if missing.';
