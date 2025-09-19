-- Fix calc_total_application_fee function to include refunded payments
-- This ensures that partially refunded payments are still counted in the total application fee calculation

CREATE OR REPLACE FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_total_fee INTEGER;
BEGIN
    SELECT COALESCE(SUM(p.application_fee_amount), 0)::INT
    INTO   v_total_fee
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status IN ('paid', 'refunded');

    RETURN v_total_fee;
END;
$$;

COMMENT ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") IS 'イベント単位でアプリケーション手数料（プラットフォーム手数料）を合計計算。部分返金された決済も含める。';

-- Grant permissions
GRANT ALL ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") TO "service_role";
