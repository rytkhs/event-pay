-- 20250821000004_fix_settlement_report_already_exists.sql
--
-- Purpose: Fix `already_exists` flag in public.generate_settlement_report()
--           Use two-step UPSERT (INSERT … ON CONFLICT DO NOTHING + UPDATE) and
--           ROW_COUNT to detect whether today’s report row was newly created
--           or an existing row was updated.
-- ---------------------------------------------------------------------

-- Recreate function with improved logic
CREATE OR REPLACE FUNCTION public.generate_settlement_report(
    p_event_id UUID,
    p_created_by UUID
) RETURNS TABLE (
    report_id UUID,
    already_exists BOOLEAN,
    event_id UUID,
    event_title VARCHAR(255),
    event_date DATE,
    created_by UUID,
    stripe_account_id VARCHAR(255),
    transfer_group TEXT,
    total_stripe_sales INTEGER,
    total_stripe_fee INTEGER,
    total_application_fee INTEGER,
    total_disputed_amount INTEGER,
    dispute_count INTEGER,
    net_payout_amount INTEGER,
    payment_count INTEGER,
    refunded_count INTEGER,
    total_refunded_amount INTEGER,
    settlement_mode TEXT,
    generated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
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
    v_total_refunded_amount INTEGER := 0;
    v_total_app_fee_refunded INTEGER := 0;
    v_total_disputed_amount INTEGER := 0;
    v_dispute_count INTEGER := 0;
    v_net_application_fee INTEGER;
    v_net_amount INTEGER;
    v_payment_count INTEGER;
    v_refunded_count INTEGER := 0;
    v_transfer_group TEXT;
    v_refund_data JSON;
    v_rowcnt INT := 0;
    v_generated_at TIMESTAMPTZ;
    v_updated_at TIMESTAMPTZ;
BEGIN
    -- 1) Validation -----------------------------------------------------
    IF p_event_id IS NULL OR p_created_by IS NULL THEN
        RAISE EXCEPTION 'event_id and created_by are required';
    END IF;

    -- 2) Event & Stripe account check ----------------------------------
    SELECT e.id,
           e.title,
           e.date,
           e.created_by,
           sca.stripe_account_id
      INTO v_event_data
      FROM public.events e
      JOIN public.stripe_connect_accounts sca ON sca.user_id = e.created_by
     WHERE e.id = p_event_id
       AND e.created_by = p_created_by
       AND sca.payouts_enabled = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found or organizer not authorized, or Stripe Connect account not ready';
    END IF;

    -- 3) Aggregations ---------------------------------------------------
    v_transfer_group := 'event_' || p_event_id::text || '_payout';

    SELECT COALESCE(SUM(p.amount), 0)::INT,
           COUNT(*)::INT
      INTO v_stripe_sales,
           v_payment_count
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status IN ('paid', 'refunded');

    v_stripe_fee := public.calc_total_stripe_fee(p_event_id);
    v_application_fee := public.calc_total_application_fee(p_event_id);

    v_refund_data := public.calc_refund_dispute_summary(p_event_id);
    IF v_refund_data IS NOT NULL THEN
        v_total_refunded_amount  := COALESCE((v_refund_data ->> 'totalRefundedAmount')::INT, 0);
        v_total_app_fee_refunded := COALESCE((v_refund_data ->> 'totalApplicationFeeRefunded')::INT, 0);
        v_refunded_count         := COALESCE((v_refund_data ->> 'refundedCount')::INT, 0);
        v_total_disputed_amount  := COALESCE((v_refund_data ->> 'totalDisputedAmount')::INT, 0);
        v_dispute_count          := COALESCE((v_refund_data ->> 'disputeCount')::INT, 0);
    END IF;

    v_net_application_fee := GREATEST(v_application_fee - v_total_app_fee_refunded, 0);
    v_net_amount := (v_stripe_sales - v_total_refunded_amount - v_total_disputed_amount) - v_net_application_fee;

    ---------------------------------------------------------------------
    -- 4) Two-step UPSERT to detect insert vs update --------------------
    ---------------------------------------------------------------------

    -- (a) TRY INSERT ----------------------------------------------------
    INSERT INTO public.payouts (
        event_id,
        user_id,
        total_stripe_sales,
        total_stripe_fee,
        platform_fee,
        total_disputed_amount,
        dispute_count,
        net_payout_amount,
        stripe_account_id,
        transfer_group,
        settlement_mode,
        status,
        generated_at,
        updated_at
    ) VALUES (
        p_event_id,
        p_created_by,
        v_stripe_sales,
        v_stripe_fee,
        v_net_application_fee,
        v_total_disputed_amount,
        v_dispute_count,
        v_net_amount,
        v_event_data.stripe_account_id,
        v_transfer_group,
        'destination_charge',
        'completed',
        now(),
        now()
    ) ON CONFLICT ON CONSTRAINT uniq_payouts_event_generated_date_jst DO NOTHING
      RETURNING id, generated_at, updated_at
      INTO v_payout_id, v_generated_at, v_updated_at;

    GET DIAGNOSTICS v_rowcnt = ROW_COUNT;  -- 1 when inserted, 0 when conflicted

    -- (b) If row existed, UPDATE ---------------------------------------
    IF v_rowcnt = 0 THEN
        UPDATE public.payouts
           SET total_stripe_sales = v_stripe_sales,
               total_stripe_fee   = v_stripe_fee,
               platform_fee       = v_net_application_fee,
               total_disputed_amount = v_total_disputed_amount,
               dispute_count         = v_dispute_count,
               net_payout_amount  = v_net_amount,
               updated_at         = now()
         WHERE event_id = p_event_id
           AND (generated_at AT TIME ZONE 'Asia/Tokyo')::date = (now() AT TIME ZONE 'Asia/Tokyo')::date
         RETURNING id, generated_at, updated_at
         INTO v_payout_id, v_generated_at, v_updated_at;
    END IF;

    ---------------------------------------------------------------------
    -- 5) Build RETURN record -------------------------------------------
    ---------------------------------------------------------------------

    report_id := v_payout_id;
    already_exists := (v_rowcnt = 0);  -- true if UPDATE path
    event_id := p_event_id;
    event_title := v_event_data.title;
    event_date := v_event_data.date;
    created_by := p_created_by;
    stripe_account_id := v_event_data.stripe_account_id;
    transfer_group := v_transfer_group;
    total_stripe_sales := v_stripe_sales;
    total_stripe_fee := v_stripe_fee;
    total_application_fee := v_net_application_fee;
    total_disputed_amount := v_total_disputed_amount;
    dispute_count := v_dispute_count;
    net_payout_amount := v_net_amount;
    payment_count := v_payment_count;
    refunded_count := v_refunded_count;
    total_refunded_amount := v_total_refunded_amount;
    settlement_mode := 'destination_charge';
    generated_at := v_generated_at;
    updated_at := v_updated_at;

    RETURN;
END;
$$;
