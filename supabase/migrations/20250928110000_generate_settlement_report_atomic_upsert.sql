-- ====================================================================
-- 20250928110000 generate_settlement_report: atomic upsert to avoid race
--  - Replace 2-step SELECT/INSERT (or UPDATE) with single-statement UPSERT
--  - Uses unique index: uniq_payouts_event_generated_date_jst
--  - Guarantees same-day (JST) snapshot overwrite under concurrency
-- ====================================================================

BEGIN;

-- Drop previous implementation to allow clean re-creation
DROP FUNCTION IF EXISTS public.generate_settlement_report(UUID, UUID);

CREATE FUNCTION public.generate_settlement_report(
    p_event_id UUID,
    p_organizer_id UUID
) RETURNS UUID
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
    v_net_application_fee INTEGER;
    v_net_amount INTEGER;
    v_payment_count INTEGER;
    v_transfer_group TEXT;
    v_refund_data JSON;
BEGIN
    -- Validation
    IF p_event_id IS NULL OR p_organizer_id IS NULL THEN
        RAISE EXCEPTION 'event_id and organizer_id are required';
    END IF;

    -- Event and Connect account checks
    SELECT e.id,
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

    -- Transfer group (for correlation/search)
    v_transfer_group := 'event_' || p_event_id::text || '_payout';

    -- Aggregate sales (Stripe only, paid)
    SELECT COALESCE(SUM(p.amount), 0)::INT,
           COUNT(*)::INT
      INTO v_stripe_sales,
           v_payment_count
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    -- Fees
    v_stripe_fee      := public.calc_total_stripe_fee(p_event_id);
    v_application_fee := public.calc_total_application_fee(p_event_id);

    -- Refund/Dispute summary (JSON with keys totalRefundedAmount, totalApplicationFeeRefunded)
    v_refund_data := public.calc_refund_dispute_summary(p_event_id);
    IF v_refund_data IS NOT NULL THEN
        v_total_refunded_amount  := COALESCE((v_refund_data ->> 'totalRefundedAmount')::INT, 0);
        v_total_app_fee_refunded := COALESCE((v_refund_data ->> 'totalApplicationFeeRefunded')::INT, 0);
    END IF;

    -- Net application fee cannot be negative
    v_net_application_fee := GREATEST(v_application_fee - v_total_app_fee_refunded, 0);

    -- Net payout amount considers refunded sales and net application fee
    v_net_amount := (v_stripe_sales - v_total_refunded_amount)
                    - v_stripe_fee
                    - v_net_application_fee;

    -- Atomic upsert using JST-date uniqueness
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
        generated_at,
        updated_at
    ) VALUES (
        p_event_id,
        p_organizer_id,
        v_stripe_sales,
        v_stripe_fee,
        v_net_application_fee,
        v_net_amount,
        v_event_data.stripe_account_id,
        v_transfer_group,
        'destination_charge',
        'completed',
        now(),
        now()
    )
    ON CONFLICT ON CONSTRAINT uniq_payouts_event_generated_date_jst DO UPDATE SET
        total_stripe_sales = EXCLUDED.total_stripe_sales,
        total_stripe_fee   = EXCLUDED.total_stripe_fee,
        platform_fee       = EXCLUDED.platform_fee,
        net_payout_amount  = EXCLUDED.net_payout_amount,
        updated_at         = now()
    RETURNING id INTO v_payout_id;

    RETURN v_payout_id;
END;
$$;

COMMENT ON FUNCTION public.generate_settlement_report(UUID, UUID)
IS 'Generate settlement report (destination charges). Atomic UPSERT by (event_id, JST date of generated_at) to avoid race; refunds considered. Same-day overwrite, next day new snapshot.';

COMMIT;

DO $$ BEGIN
    RAISE NOTICE '✅ generate_settlement_report updated to atomic UPSERT with JST-date uniqueness.';
END $$;
