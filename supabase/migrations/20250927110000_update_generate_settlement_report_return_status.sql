-- ====================================================================
-- Update generate_settlement_report to return status (report_id, already_exists)
-- ====================================================================

-- Drop the previous version to allow return type change
DROP FUNCTION IF EXISTS public.generate_settlement_report(UUID, UUID);

CREATE FUNCTION public.generate_settlement_report(
    p_event_id UUID,
    p_organizer_id UUID
) RETURNS TABLE (
    report_id UUID,
    already_exists BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payout_id UUID;
    v_event_data RECORD;
    v_stripe_sales INTEGER;
    v_stripe_fee INTEGER;
    v_application_fee INTEGER;
    v_net_amount INTEGER;
    v_refund_data JSON;
    v_payment_count INTEGER;
    v_transfer_group TEXT;
    v_today_start TIMESTAMP WITH TIME ZONE;
    v_today_end TIMESTAMP WITH TIME ZONE;
    v_existing_report_id UUID;
BEGIN
    -- Validate inputs
    IF p_event_id IS NULL OR p_organizer_id IS NULL THEN
        RAISE EXCEPTION 'event_id and organizer_id are required';
    END IF;

    -- Fetch event and stripe account info
    SELECT
        e.id,
        e.title,
        e.date,
        e.created_by,
        sca.stripe_account_id
    INTO v_event_data
    FROM public.events e
    JOIN public.stripe_connect_accounts sca ON sca.user_id = e.created_by
    WHERE e.id = p_event_id
      AND e.created_by = p_organizer_id
      AND sca.payouts_enabled = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found or organizer not authorized, or Stripe Connect account not ready';
    END IF;

    -- JST day range (today)
    v_today_start := (now() AT TIME ZONE 'Asia/Tokyo')::date AT TIME ZONE 'Asia/Tokyo';
    v_today_end := v_today_start + INTERVAL '1 day';

    -- Check if report already exists today (same-day duplicate prevention)
    SELECT id INTO v_existing_report_id
    FROM public.payouts
    WHERE event_id = p_event_id
      AND settlement_mode = 'destination_charge'
      AND generated_at >= v_today_start
      AND generated_at < v_today_end
    LIMIT 1;

    IF v_existing_report_id IS NOT NULL THEN
        report_id := v_existing_report_id;
        already_exists := TRUE;
        RETURN;
    END IF;

    -- Build transfer group
    v_transfer_group := 'event_' || p_event_id::text || '_payout';

    -- Aggregate sales (Stripe only)
    SELECT
        COALESCE(SUM(p.amount), 0)::INT,
        COUNT(*)::INT
    INTO
        v_stripe_sales,
        v_payment_count
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status = 'paid';

    -- Stripe fee
    v_stripe_fee := public.calc_total_stripe_fee(p_event_id);

    -- Application fee
    v_application_fee := public.calc_total_application_fee(p_event_id);

    -- Refund / dispute summary (reserved for future use)
    v_refund_data := public.calc_refund_dispute_summary(p_event_id);

    -- Net amount
    v_net_amount := v_stripe_sales - v_stripe_fee - v_application_fee;

    -- Insert snapshot (new day or first time)
    INSERT INTO public.payouts (
        event_id,
        user_id,
        total_stripe_sales,
        total_stripe_fee,
        platform_fee,
        net_payout_amount,
        stripe_account_id,
        transfer_group,
        settlement_mode,
        status,
        generated_at
    ) VALUES (
        p_event_id,
        p_organizer_id,
        v_stripe_sales,
        v_stripe_fee,
        v_application_fee,
        v_net_amount,
        v_event_data.stripe_account_id,
        v_transfer_group,
        'destination_charge',
        'completed',
        now()
    )
    RETURNING id INTO v_payout_id;

    report_id := v_payout_id;
    already_exists := FALSE;
    RETURN;

EXCEPTION
    WHEN unique_violation THEN
        -- If a uniqueness constraint is added later, return the existing report (fallback)
        SELECT id INTO v_existing_report_id
        FROM public.payouts
        WHERE event_id = p_event_id
          AND settlement_mode = 'destination_charge'
          AND generated_at >= v_today_start
          AND generated_at < v_today_end
        LIMIT 1;

        IF v_existing_report_id IS NOT NULL THEN
            report_id := v_existing_report_id;
            already_exists := TRUE;
            RETURN;
        ELSE
            RAISE;
        END IF;
END;
$$;

COMMENT ON FUNCTION public.generate_settlement_report(UUID, UUID) IS 'Generate settlement report for destination charges. Returns (report_id, already_exists). Same-day duplicates return existing ID, next day creates new snapshot.';
