-- ====================================================================
-- Update settlement report regeneration logic
--  - Add updated_at column to payouts
--  - Modify generate_settlement_report to update existing same-day report
-- ====================================================================

-- 1. Add updated_at column (timestamp when report last recalculated)
ALTER TABLE public.payouts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Redefine function generate_settlement_report
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
    v_net_amount INTEGER;
    v_refund_data JSON; -- 将来利用予定
    v_payment_count INTEGER;
    v_transfer_group TEXT;
    v_today_start TIMESTAMP WITH TIME ZONE;
    v_today_end TIMESTAMP WITH TIME ZONE;
    v_existing_report_id UUID;
BEGIN
    -- Validation
    IF p_event_id IS NULL OR p_organizer_id IS NULL THEN
        RAISE EXCEPTION 'event_id and organizer_id are required';
    END IF;

    -- Get event & connect account details (same as previous)
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

    -- JST day range
    v_today_start := (now() AT TIME ZONE 'Asia/Tokyo')::date AT TIME ZONE 'Asia/Tokyo';
    v_today_end   := v_today_start + INTERVAL '1 day';

    -- Check existing report of today
    SELECT id
      INTO v_existing_report_id
      FROM public.payouts
     WHERE event_id = p_event_id
       AND settlement_mode = 'destination_charge'
       AND generated_at >= v_today_start
       AND generated_at < v_today_end
     LIMIT 1;

    -- Transfer group
    v_transfer_group := 'event_' || p_event_id::text || '_payout';

    -- Aggregate sales (Stripe only)
    SELECT COALESCE(SUM(p.amount),0)::INT,
           COUNT(*)::INT
      INTO v_stripe_sales,
           v_payment_count
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    -- Fees
    v_stripe_fee       := public.calc_total_stripe_fee(p_event_id);
    v_application_fee  := public.calc_total_application_fee(p_event_id);

    -- Net amount
    v_net_amount := v_stripe_sales - v_stripe_fee - v_application_fee;

    IF v_existing_report_id IS NOT NULL THEN
        -- Update existing same-day report (overwrite totals & updated_at)
        UPDATE public.payouts
           SET total_stripe_sales   = v_stripe_sales,
               total_stripe_fee     = v_stripe_fee,
               platform_fee         = v_application_fee,
               net_payout_amount    = v_net_amount,
               updated_at           = now()
         WHERE id = v_existing_report_id;

        RETURN v_existing_report_id;
    END IF;

    -- No existing report today -> insert new snapshot (next day or first time)
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
        v_application_fee,
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
IS 'イベント清算レポート生成（destination charges）。同日内は再計算して上書き、翌日以降は新規スナップショットを挿入する。返金・Dispute考慮済み。';
