-- ====================================================================
-- 20250926100000 update settlement report to consider refunds and same-day overwrite
--  - net_payout_amount now accounts for refunded sales and application fee refunds
--  - platform_fee stores net application fee (after refunds)
--  - same-day report is updated (overwrite) and updated_at is set
--  - backfill: re-generate today's snapshots to align with new logic
-- ====================================================================

BEGIN;

-- 0) Ensure updated_at exists (idempotent)
ALTER TABLE public.payouts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 1) Redefine function: generate_settlement_report(event_id, organizer_id)
CREATE OR REPLACE FUNCTION public.generate_settlement_report(
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
    v_today_start TIMESTAMPTZ;
    v_today_end TIMESTAMPTZ;
    v_existing_report_id UUID;
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

    -- JST day window for uniqueness/overwrite
    v_today_start := (now() AT TIME ZONE 'Asia/Tokyo')::date AT TIME ZONE 'Asia/Tokyo';
    v_today_end   := v_today_start + INTERVAL '1 day';

    -- Existing same-day report (destination_charge) lookup
    SELECT id
      INTO v_existing_report_id
      FROM public.payouts
     WHERE event_id = p_event_id
       AND settlement_mode = 'destination_charge'
       AND generated_at >= v_today_start
       AND generated_at <  v_today_end
     LIMIT 1;

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

    IF v_existing_report_id IS NOT NULL THEN
        -- Overwrite same-day snapshot (update totals and updated_at)
        UPDATE public.payouts
           SET total_stripe_sales = v_stripe_sales,
               total_stripe_fee   = v_stripe_fee,
               platform_fee       = v_net_application_fee,
               net_payout_amount  = v_net_amount,
               updated_at         = now()
         WHERE id = v_existing_report_id;
        RETURN v_existing_report_id;
    END IF;

    -- Insert new snapshot
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
    ) RETURNING id INTO v_payout_id;

    RETURN v_payout_id;
END;
$$;

COMMENT ON FUNCTION public.generate_settlement_report(UUID, UUID)
IS 'Generate settlement report (destination charges). Refunds considered; same-day snapshot is overwritten, updated_at maintained. Next day creates new snapshot.';

-- 2) Backfill today''s snapshots using new logic (best-effort, idempotent)
DO $$
DECLARE
    r RECORD;
    v_today_start TIMESTAMPTZ := (now() AT TIME ZONE 'Asia/Tokyo')::date AT TIME ZONE 'Asia/Tokyo';
    v_today_end   TIMESTAMPTZ := v_today_start + INTERVAL '1 day';
BEGIN
    FOR r IN (
        SELECT id, event_id, user_id
          FROM public.payouts
         WHERE settlement_mode = 'destination_charge'
           AND generated_at >= v_today_start
           AND generated_at <  v_today_end
    ) LOOP
        BEGIN
            PERFORM public.generate_settlement_report(r.event_id, r.user_id);
        EXCEPTION WHEN OTHERS THEN
            -- ignore errors in backfill to avoid migration failure
            NULL;
        END;
    END LOOP;
END $$;

COMMIT;

-- Done
DO $$ BEGIN
    RAISE NOTICE '✅ Settlement report function updated: refunds and net application fee considered, same-day overwrite enabled.';
END $$;
