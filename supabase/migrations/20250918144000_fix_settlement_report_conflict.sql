-- Fix duplicate key error in generate_settlement_report function
-- The ON CONFLICT condition should match the unique_active_settlement_per_event constraint
-- Note: Need to drop and recreate function because return type is changing

DROP FUNCTION IF EXISTS "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid");

CREATE FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") RETURNS TABLE("report_id" "uuid", "already_exists" boolean, "returned_event_id" "uuid", "event_title" character varying, "event_date" timestamp with time zone, "created_by" "uuid", "stripe_account_id" character varying, "transfer_group" "text", "total_stripe_sales" integer, "total_stripe_fee" integer, "total_application_fee" integer, "net_payout_amount" integer, "payment_count" integer, "refunded_count" integer, "total_refunded_amount" integer, "dispute_count" integer, "total_disputed_amount" integer, "report_generated_at" timestamp with time zone, "report_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_payout_id UUID;
    v_event_data RECORD;
    v_stripe_sales INTEGER;
    v_stripe_fee INTEGER;
    v_application_fee INTEGER;
    v_total_refunded_amount INTEGER := 0;
    v_total_app_fee_refunded INTEGER := 0;
    v_net_application_fee INTEGER;
    v_net_amount INTEGER;
    v_payment_count INTEGER;
    v_refunded_count INTEGER := 0;
    v_dispute_count INTEGER := 0;
    v_total_disputed_amount INTEGER := 0;
    v_transfer_group TEXT;
    v_refund_data JSON;
    v_was_update BOOLEAN := FALSE;
    v_generated_at TIMESTAMPTZ;
    v_updated_at TIMESTAMPTZ;
BEGIN
    -- Validation
    IF input_event_id IS NULL OR input_created_by IS NULL THEN
        RAISE EXCEPTION 'event_id and created_by are required';
    END IF;

    -- Event & Connect account validation
    SELECT e.id,
           e.title,
           e.date,
           e.created_by,
           sca.stripe_account_id
      INTO v_event_data
      FROM public.events e
      JOIN public.stripe_connect_accounts sca ON sca.user_id = e.created_by
     WHERE e.id = input_event_id
       AND e.created_by = input_created_by
       AND sca.payouts_enabled = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found or organizer not authorized, or Stripe Connect account not ready';
    END IF;

    -- Correlation key for Transfers
    v_transfer_group := 'event_' || input_event_id::text || '_payout';

    -- Aggregate sales: include both paid & refunded Stripe payments
    SELECT COALESCE(SUM(p.amount), 0)::INT,
           COUNT(*)::INT
      INTO v_stripe_sales,
           v_payment_count
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = input_event_id
       AND p.method = 'stripe'
       AND p.status IN ('paid', 'refunded');

    -- Stripe platform fee (platform cost – not used in net calc)
    v_stripe_fee := public.calc_total_stripe_fee(input_event_id);

    -- Application fee (gross)
    v_application_fee := public.calc_total_application_fee(input_event_id);

    -- Refund summary JSON
    v_refund_data := public.calc_refund_dispute_summary(input_event_id);
    IF v_refund_data IS NOT NULL THEN
        v_total_refunded_amount  := COALESCE((v_refund_data ->> 'totalRefundedAmount')::INT, 0);
        v_total_app_fee_refunded := COALESCE((v_refund_data ->> 'totalApplicationFeeRefunded')::INT, 0);
        v_refunded_count         := COALESCE((v_refund_data ->> 'refundedCount')::INT, 0);
        v_dispute_count          := COALESCE((v_refund_data ->> 'disputeCount')::INT, 0);
        v_total_disputed_amount  := COALESCE((v_refund_data ->> 'totalDisputedAmount')::INT, 0);
    END IF;

    -- Net application fee (cannot be negative)
    v_net_application_fee := GREATEST(v_application_fee - v_total_app_fee_refunded, 0);

    -- Net payout amount (Stripe fee is platform-borne)
    v_net_amount := (v_stripe_sales - v_total_refunded_amount) - v_net_application_fee;

    -- Try to update existing active settlement record first
    UPDATE public.settlements SET
        total_stripe_sales = v_stripe_sales,
        total_stripe_fee = v_stripe_fee,
        platform_fee = v_net_application_fee,
        net_payout_amount = v_net_amount,
        updated_at = now()
    WHERE event_id = input_event_id
    RETURNING id, generated_at, updated_at
    INTO v_payout_id, v_generated_at, v_updated_at;

    -- Check if we updated an existing record
    IF FOUND THEN
        v_was_update := TRUE;
    ELSE
        -- Insert new settlement record if no active record exists
        INSERT INTO public.settlements (
            event_id,
            user_id,
            total_stripe_sales,
            total_stripe_fee,
            platform_fee,
            net_payout_amount,
            stripe_account_id,
            transfer_group,
            -- settlement_mode は削除済み
            -- status は削除済み
            generated_at
        ) VALUES (
            input_event_id,
            input_created_by,
            v_stripe_sales,
            v_stripe_fee,
            v_net_application_fee,
            v_net_amount,
            v_event_data.stripe_account_id,
            v_transfer_group,
            -- 'destination_charge', 'completed' は削除済み
            now()
        )
        RETURNING id, generated_at, updated_at
        INTO v_payout_id, v_generated_at, v_updated_at;

        v_was_update := FALSE;
    END IF;

    -- Return enriched record
    report_id := v_payout_id;
    already_exists := NOT v_was_update;
    returned_event_id := input_event_id;
    event_title := v_event_data.title;
    event_date := v_event_data.date;
    created_by := input_created_by;
    stripe_account_id := v_event_data.stripe_account_id;
    transfer_group := v_transfer_group;
    total_stripe_sales := v_stripe_sales;
    total_stripe_fee := v_stripe_fee;
    total_application_fee := v_net_application_fee;
    net_payout_amount := v_net_amount;
    payment_count := v_payment_count;
    refunded_count := v_refunded_count;
    total_refunded_amount := v_total_refunded_amount;
    dispute_count := v_dispute_count;
    total_disputed_amount := v_total_disputed_amount;
    -- settlement_mode は削除済み
    report_generated_at := v_generated_at;
    report_updated_at := v_updated_at;

    RETURN NEXT;
END;
$$;

-- Grant permissions
GRANT ALL ON FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") TO "service_role";
