-- ====================================================================
-- EventPay: Disputes support
-- - payment_disputes table
-- - RLS policies
-- - functions updated (calc_refund_dispute_summary, generate_settlement_report)
-- - payments: reversal tracking columns
-- ====================================================================

BEGIN;

-- 1) Table: payment_disputes
CREATE TABLE IF NOT EXISTS public.payment_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    stripe_dispute_id VARCHAR(255) UNIQUE NOT NULL,
    charge_id VARCHAR(255),
    payment_intent_id VARCHAR(255),
    amount INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'jpy',
    reason VARCHAR(50),
    status VARCHAR(50) NOT NULL,
    evidence_due_by TIMESTAMPTZ,
    stripe_account_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_disputes_payment_id ON public.payment_disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_dispute_status ON public.payment_disputes(status);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_charge_id ON public.payment_disputes(charge_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_pi_id ON public.payment_disputes(payment_intent_id);

COMMENT ON TABLE public.payment_disputes IS 'Stripe Dispute records linked to payments for aggregation and audit.';

-- 2) RLS Policies: allow event owner to SELECT; server-side uses service role (bypasses RLS)
DROP POLICY IF EXISTS dispute_select_event_owner ON public.payment_disputes;
CREATE POLICY dispute_select_event_owner
  ON public.payment_disputes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.payments p
      JOIN public.attendances a ON a.id = p.attendance_id
      JOIN public.events e ON e.id = a.event_id
      WHERE p.id = payment_disputes.payment_id
        AND e.created_by = auth.uid()
    )
  );

-- 3) payments: transfer reversal tracking
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_transfer_reversal_id VARCHAR(255);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS transfer_reversed_amount INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payments_transfer_reversal_id ON public.payments(stripe_transfer_reversal_id);

-- 4) payouts テーブルに Dispute 集計列を追加（重複実行安全）
ALTER TABLE public.payouts
    ADD COLUMN IF NOT EXISTS total_disputed_amount INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dispute_count INTEGER NOT NULL DEFAULT 0;

-- 5) Update refund/dispute summary (exclude 'won')
CREATE OR REPLACE FUNCTION public.calc_refund_dispute_summary(
    p_event_id UUID
) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_refunded_amount INTEGER := 0;
    v_refunded_count INTEGER := 0;
    v_total_app_fee_refunded INTEGER := 0;
    v_total_disputed_amount INTEGER := 0;
    v_dispute_count INTEGER := 0;
    v_result JSON;
BEGIN
    -- Refund totals
    SELECT
        COALESCE(SUM(p.refunded_amount), 0)::INT,
        COUNT(*)::INT,
        COALESCE(SUM(p.application_fee_refunded_amount), 0)::INT
    INTO
        v_total_refunded_amount,
        v_refunded_count,
        v_total_app_fee_refunded
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.refunded_amount > 0;

    -- Dispute totals: include all except 'won'
    SELECT
        COALESCE(SUM(d.amount), 0)::INT,
        COUNT(*)::INT
    INTO
        v_total_disputed_amount,
        v_dispute_count
    FROM public.payment_disputes d
    JOIN public.payments p ON p.id = d.payment_id
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND d.status NOT IN ('won', 'warning_closed');

    v_result := json_build_object(
        'totalRefundedAmount', v_total_refunded_amount,
        'refundedCount', v_refunded_count,
        'totalApplicationFeeRefunded', v_total_app_fee_refunded,
        'totalDisputedAmount', v_total_disputed_amount,
        'disputeCount', v_dispute_count
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calc_refund_dispute_summary(UUID) IS 'イベント単位の返金・Dispute集計（won以外のDisputeを控除対象とする）';

-- 6) generate_settlement_report を拡張 (refund+dispute)

-- 旧関数を削除して戻り値を差し替え
DROP FUNCTION IF EXISTS public.generate_settlement_report(UUID, UUID);

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
    v_was_update BOOLEAN := FALSE;
    v_generated_at TIMESTAMPTZ;
    v_updated_at TIMESTAMPTZ;
BEGIN
    IF p_event_id IS NULL OR p_created_by IS NULL THEN
        RAISE EXCEPTION 'event_id and created_by are required';
    END IF;

    SELECT e.id, e.title, e.date, e.created_by, sca.stripe_account_id
      INTO v_event_data
      FROM public.events e
      JOIN public.stripe_connect_accounts sca ON sca.user_id = e.created_by
     WHERE e.id = p_event_id
       AND e.created_by = p_created_by
       AND sca.payouts_enabled = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found or organizer not authorized, or Stripe Connect account not ready';
    END IF;

    v_transfer_group := 'event_' || p_event_id::text || '_payout';

    SELECT COALESCE(SUM(p.amount), 0)::INT, COUNT(*)::INT
      INTO v_stripe_sales, v_payment_count
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

    INSERT INTO public.payouts (
        event_id, user_id, total_stripe_sales, total_stripe_fee, platform_fee,
        total_disputed_amount, dispute_count, net_payout_amount, stripe_account_id,
        transfer_group, settlement_mode, status, generated_at
    ) VALUES (
        p_event_id, p_created_by, v_stripe_sales, v_stripe_fee, v_net_application_fee,
        v_total_disputed_amount, v_dispute_count, v_net_amount, v_event_data.stripe_account_id,
        v_transfer_group, 'destination_charge', 'completed', now()
    ) ON CONFLICT (event_id, (DATE(generated_at AT TIME ZONE 'Asia/Tokyo'))) DO UPDATE SET
        total_stripe_sales = EXCLUDED.total_stripe_sales,
        total_stripe_fee   = EXCLUDED.total_stripe_fee,
        platform_fee       = EXCLUDED.platform_fee,
        total_disputed_amount = EXCLUDED.total_disputed_amount,
        dispute_count = EXCLUDED.dispute_count,
        net_payout_amount  = EXCLUDED.net_payout_amount
    RETURNING id, (xmax = 0), public.payouts.generated_at, public.payouts.updated_at
      INTO v_payout_id, v_was_update, v_generated_at, v_updated_at;

    report_id := v_payout_id;
    already_exists := NOT v_was_update;
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

COMMENT ON FUNCTION public.generate_settlement_report(UUID, UUID) IS 'Generate settlement report with refund & dispute adjustments.';

-- ==============================================
-- get_settlement_report_details (Dispute対応版)
-- ==============================================

DROP FUNCTION IF EXISTS public.get_settlement_report_details(
    UUID,
    UUID[],
    TIMESTAMPTZ,
    TIMESTAMPTZ,
    INTEGER,
    INTEGER
);

CREATE OR REPLACE FUNCTION public.get_settlement_report_details(
    p_created_by UUID,
    p_event_ids UUID[] DEFAULT NULL,
    p_from_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
    report_id UUID,
    event_id UUID,
    event_title VARCHAR(255),
    event_date DATE,
    stripe_account_id VARCHAR(255),
    transfer_group VARCHAR(255),
    generated_at TIMESTAMP WITH TIME ZONE,

    total_stripe_sales INTEGER,
    total_stripe_fee INTEGER,
    total_application_fee INTEGER,
    total_disputed_amount INTEGER,
    dispute_count INTEGER,
    net_payout_amount INTEGER,

    payment_count INTEGER,
    refunded_count INTEGER,
    total_refunded_amount INTEGER,

    settlement_mode settlement_mode_enum,
    status payout_status_enum
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id AS report_id,
        p.event_id,
        e.title AS event_title,
        e.date AS event_date,
        p.stripe_account_id,
        p.transfer_group,
        p.generated_at,

        p.total_stripe_sales,
        p.total_stripe_fee,
        p.platform_fee AS total_application_fee,
        p.total_disputed_amount,
        p.dispute_count,
        p.net_payout_amount,

        -- 決済件数
        (
            SELECT COUNT(*)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.status = 'paid'
        ) AS payment_count,

        -- 返金件数
        (
            SELECT COUNT(*)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.refunded_amount > 0
        ) AS refunded_count,

        (
            SELECT COALESCE(SUM(pay.refunded_amount), 0)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.refunded_amount > 0
        ) AS total_refunded_amount,

        p.settlement_mode,
        p.status
    FROM public.payouts p
    JOIN public.events e ON p.event_id = e.id
    WHERE p.user_id = p_created_by
      AND p.settlement_mode = 'destination_charge'
      AND (p_event_ids IS NULL OR p.event_id = ANY(p_event_ids))
      AND (p_from_date IS NULL OR p.generated_at >= p_from_date)
      AND (p_to_date IS NULL OR p.generated_at <= p_to_date)
    ORDER BY p.generated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_settlement_report_details(UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER)
IS '清算レポート一覧（refund + dispute 列込み）';

COMMIT;
