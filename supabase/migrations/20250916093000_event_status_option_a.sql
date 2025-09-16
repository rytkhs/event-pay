-- =============================================================
-- Event Status Migration (Option A - 都度算出, 破壊的変更)
-- - Remove events.status & event_status_enum
-- - Add canceled_at, canceled_by
-- - Update functions/policies to not depend on status
-- - Add indexes for performance
-- =============================================================

BEGIN;

-- 1) Schema changes: add canceled columns
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_by uuid REFERENCES public.users(id);

-- 2) Update RLS policies that referenced e.status
-- Drop and recreate policy: "Guest token update payment details"
DROP POLICY IF EXISTS "Guest token update payment details" ON public.payments;

CREATE POLICY "Guest token update payment details" ON public.payments FOR UPDATE TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.attendances a
    JOIN public.events e ON a.event_id = e.id
    WHERE a.id = payments.attendance_id
      AND a.guest_token IS NOT NULL
      AND a.guest_token = public.get_guest_token()
      AND e.canceled_at IS NULL
      AND (e.payment_deadline IS NULL OR e.payment_deadline > NOW())
      AND e.date > NOW()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.attendances a
    JOIN public.events e ON a.event_id = e.id
    WHERE a.id = payments.attendance_id
      AND a.guest_token IS NOT NULL
      AND a.guest_token = public.get_guest_token()
      AND e.canceled_at IS NULL
      AND (e.payment_deadline IS NULL OR e.payment_deadline > NOW())
      AND e.date > NOW()
  )
);

-- 3) Update functions that referenced events.status

-- 3-1) update_guest_attendance_with_payment: remove status dependency, use canceled_at/date
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.update_guest_attendance_with_payment(
    p_attendance_id UUID,
    p_status public.attendance_status_enum,
    p_payment_method public.payment_method_enum DEFAULT NULL,
    p_event_fee INTEGER DEFAULT 0
  )
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $function$
  DECLARE
    v_event_id UUID;
    v_payment_id UUID;
    v_current_status public.attendance_status_enum;
    v_capacity INTEGER;
    v_current_attendees INTEGER;
    v_payment_status public.payment_status_enum;
    v_payment_method public.payment_method_enum;
    -- Guards (updated)
    v_canceled_at TIMESTAMPTZ;
    v_reg_deadline TIMESTAMPTZ;
    v_event_date TIMESTAMPTZ;
  BEGIN
    -- 参加記録の存在確認と現在のステータス取得
    SELECT event_id, status INTO v_event_id, v_current_status
    FROM public.attendances
    WHERE id = p_attendance_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Attendance record not found';
    END IF;

    -- イベント締切・開始・キャンセルチェック
    SELECT canceled_at, registration_deadline, date
      INTO v_canceled_at, v_reg_deadline, v_event_date
    FROM public.events
    WHERE id = v_event_id
    FOR SHARE;

    IF (v_canceled_at IS NOT NULL)
       OR (v_reg_deadline IS NOT NULL AND v_reg_deadline <= NOW())
       OR v_event_date <= NOW() THEN
      RAISE EXCEPTION 'Event is closed for modification';
    END IF;

    -- 定員チェック（attendingに変更する場合のみ）
    IF p_status = 'attending' AND v_current_status != 'attending' THEN
      SELECT capacity INTO v_capacity FROM public.events WHERE id = v_event_id FOR UPDATE;
      IF v_capacity IS NOT NULL THEN
        SELECT COUNT(*) INTO v_current_attendees
        FROM public.attendances
        WHERE event_id = v_event_id AND status = 'attending' AND id != p_attendance_id;

        IF v_current_attendees >= v_capacity THEN
          RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_attendees;
        END IF;
      END IF;
    END IF;

    -- 参加ステータスを更新
    UPDATE public.attendances
    SET status = p_status
    WHERE id = p_attendance_id;

    -- 決済レコードの処理
    IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
      SELECT id, status INTO v_payment_id, v_payment_status
      FROM public.payments
      WHERE attendance_id = p_attendance_id
      ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
      LIMIT 1;

      IF v_payment_id IS NOT NULL THEN
        IF v_payment_status IN ('paid', 'received', 'completed', 'waived') THEN
          RAISE EXCEPTION 'EVP_PAYMENT_FINALIZED_IMMUTABLE: Payment is finalized; cannot modify method/amount';
        ELSE
          UPDATE public.payments
          SET method = p_payment_method,
              amount = p_event_fee,
              status = 'pending'
          WHERE id = v_payment_id;
        END IF;
      ELSE
        INSERT INTO public.payments (
          attendance_id,
          amount,
          method,
          status
        ) VALUES (
          p_attendance_id,
          p_event_fee,
          p_payment_method,
          'pending'
        );
      END IF;
    ELSIF p_status != 'attending' THEN
      SELECT id, status, method INTO v_payment_id, v_payment_status, v_payment_method
      FROM public.payments
      WHERE attendance_id = p_attendance_id
      ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
      LIMIT 1;

      IF FOUND THEN
        IF v_payment_status IN ('pending', 'failed') THEN
          DELETE FROM public.payments WHERE id = v_payment_id;
          INSERT INTO public.system_logs(operation_type, details)
          VALUES ('unpaid_payment_deleted', jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id, 'previousStatus', v_payment_status));
        ELSIF v_payment_status IN ('paid', 'received', 'completed') THEN
          IF v_payment_method = 'cash' THEN
            UPDATE public.payments SET status = 'refunded' WHERE id = v_payment_id;
            INSERT INTO public.system_logs(operation_type, details)
            VALUES ('cash_refund_recorded', jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id));
          ELSE
            INSERT INTO public.system_logs(operation_type, details)
            VALUES ('stripe_refund_required', jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id));
          END IF;
        ELSIF v_payment_status = 'waived' THEN
          INSERT INTO public.system_logs(operation_type, details)
          VALUES ('waived_payment_kept', jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id));
        END IF;
      END IF;
    END IF;

    RETURN;
  END;
  $function$;

  -- 権限設定（従来通り）
  REVOKE EXECUTE ON FUNCTION public.update_guest_attendance_with_payment(UUID,
    public.attendance_status_enum,
    public.payment_method_enum,
    INTEGER) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.update_guest_attendance_with_payment(UUID,
    public.attendance_status_enum,
    public.payment_method_enum,
    INTEGER) TO service_role;
END;
$$;

-- 3-2) can_access_event: status='upcoming' を都度算出に置換
CREATE OR REPLACE FUNCTION public.can_access_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  current_user_id UUID;
  invite_token_var TEXT;
  guest_token_var TEXT;
BEGIN
  current_user_id := auth.uid();

  BEGIN
    invite_token_var := current_setting('request.headers.x-invite-token', true);
  EXCEPTION WHEN OTHERS THEN
    invite_token_var := NULL;
  END;

  BEGIN
    guest_token_var := public.get_guest_token();
  EXCEPTION WHEN OTHERS THEN
    guest_token_var := NULL;
  END;

  IF current_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM events
      WHERE id = p_event_id
        AND created_by = current_user_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF invite_token_var IS NOT NULL AND invite_token_var != '' THEN
    IF EXISTS (
      SELECT 1 FROM events
      WHERE id = p_event_id
        AND events.invite_token = invite_token_var
        AND events.canceled_at IS NULL
        AND events.date > NOW()
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF guest_token_var IS NOT NULL AND guest_token_var != '' THEN
    IF EXISTS (
      SELECT 1 FROM attendances
      WHERE event_id = p_event_id
        AND attendances.guest_token = guest_token_var
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- 3-3) process_event_payout: past 判定を都度算出に置換（settlements版に合わせる）
CREATE OR REPLACE FUNCTION public.process_event_payout(
  p_event_id UUID,
  p_user_id  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payout_id UUID;
    existing_status payout_status_enum;
    stripe_sales INTEGER;
    stripe_fees  INTEGER;
    platform_fees INTEGER := 0;
    net_amount INTEGER;
    stripe_account VARCHAR(255);
    lock_key BIGINT;
BEGIN
    IF p_event_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'event_id and user_id cannot be null';
    END IF;

    lock_key := abs(hashtext(p_event_id::text));
    PERFORM pg_advisory_xact_lock(lock_key);

    -- 終了イベントの権限＆存在確認（非キャンセルかつ終了済み）
    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id
          AND created_by = p_user_id
          AND canceled_at IS NULL
          AND NOW() >= (date + interval '24 hours')
    ) THEN
        RAISE EXCEPTION 'Event not found or not authorized: %', p_event_id;
    END IF;

    SELECT id, status INTO payout_id, existing_status
    FROM public.settlements
    WHERE event_id = p_event_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF payout_id IS NOT NULL THEN
        IF existing_status = 'pending' THEN
            RETURN payout_id;
        ELSIF existing_status = 'failed' THEN
            UPDATE public.settlements
            SET status = 'pending',
                processed_at = NULL,
                last_error = NULL
            WHERE id = payout_id
            RETURNING id INTO payout_id;

            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
        END IF;
    END IF;

    -- Stripe Connect account (verified & payouts_enabled)
    SELECT stripe_account_id INTO stripe_account
      FROM public.stripe_connect_accounts
     WHERE user_id = p_user_id
       AND status = 'verified'
       AND payouts_enabled = true;
    IF stripe_account IS NULL THEN
        RAISE EXCEPTION 'No verified Stripe Connect account for user: %', p_user_id;
    END IF;

    SELECT COALESCE(SUM(p.amount),0)::INT INTO stripe_sales
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    stripe_fees := public.calc_total_stripe_fee(p_event_id);

    net_amount := stripe_sales - stripe_fees - platform_fees;

    IF net_amount < public.get_min_payout_amount() THEN
        RAISE EXCEPTION 'Net payout amount < minimum (%). Calculated: %', public.get_min_payout_amount(), net_amount;
    END IF;

    INSERT INTO public.settlements (
        event_id, user_id, total_stripe_sales, total_stripe_fee,
        platform_fee, net_payout_amount, stripe_account_id, status, transfer_group
    ) VALUES (
        p_event_id, p_user_id, stripe_sales, stripe_fees,
        platform_fees, net_amount, stripe_account, 'pending',
        'event_' || p_event_id::text || '_payout'
    ) RETURNING id INTO payout_id;

    RETURN payout_id;
END;
$$;

COMMENT ON FUNCTION public.process_event_payout(UUID,UUID) IS 'イベント送金処理（都度算出: ended）。settlements 対応・payouts_enabled のみ必須。';

-- 3-4) find_eligible_events_*: status='past' を都度算出に置換
CREATE OR REPLACE FUNCTION public.find_eligible_events_basic(
    p_days_after_event INTEGER DEFAULT 5,
    p_minimum_amount  INTEGER DEFAULT NULL,
    p_limit           INTEGER DEFAULT 100,
    p_user_id         UUID DEFAULT NULL
) RETURNS TABLE (
    event_id UUID,
    title VARCHAR(255),
    event_date TIMESTAMP WITH TIME ZONE,
    fee INTEGER,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    paid_attendances_count BIGINT,
    total_stripe_sales INTEGER
) LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH target_events AS (
        SELECT e.*
          FROM public.events e
         WHERE e.canceled_at IS NULL
           AND NOW() >= (e.date + interval '24 hours')
           AND e.date <= (CURRENT_DATE - p_days_after_event)
           AND (p_user_id IS NULL OR e.created_by = p_user_id)
    ), sales AS (
        SELECT a.event_id, COUNT(*) AS paid_attendances_count, SUM(p.amount)::INT AS total_stripe_sales
          FROM public.attendances a
          JOIN public.payments p ON p.attendance_id = a.id
         WHERE p.method = 'stripe' AND p.status = 'paid'
         GROUP BY a.event_id
    )
    SELECT
        t.id AS event_id,
        t.title,
        t.date AS event_date,
        t.fee,
        t.created_by,
        t.created_at,
        COALESCE(s.paid_attendances_count,0) AS paid_attendances_count,
        COALESCE(s.total_stripe_sales,0)      AS total_stripe_sales
      FROM target_events t
      LEFT JOIN sales s ON s.event_id = t.id
     WHERE COALESCE(s.total_stripe_sales,0) >= COALESCE(p_minimum_amount, public.get_min_payout_amount())
     LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_eligible_events_with_details(
    p_days_after_event INT DEFAULT 5,
    p_limit INT DEFAULT 50
) RETURNS TABLE (
    event_id UUID,
    title VARCHAR(255),
    event_date TIMESTAMP WITH TIME ZONE,
    fee INT,
    created_by UUID,
    created_at TIMESTAMPTZ,
    paid_attendances_count BIGINT,
    total_stripe_sales INT,
    total_stripe_fee INT,
    platform_fee INT,
    net_payout_amount INT,
    charges_enabled BOOLEAN,
    payouts_enabled BOOLEAN,
    eligible BOOLEAN,
    ineligible_reason TEXT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH ended_events AS (
        SELECT e.*
        FROM public.events e
        WHERE e.canceled_at IS NULL
          AND NOW() >= (e.date + interval '24 hours')
          AND e.date <= (current_date - p_days_after_event)
        LIMIT p_limit
    ),
    sales AS (
        SELECT a.event_id,
               COUNT(*) FILTER (WHERE p.status = 'paid')                        AS paid_attendances_count,
               COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'),0)::INT AS total_stripe_sales,
               public.calc_total_stripe_fee(a.event_id)                        AS total_stripe_fee
        FROM public.attendances a
        JOIN public.payments p ON p.attendance_id = a.id AND p.method = 'stripe'
        WHERE a.event_id IN (SELECT id FROM ended_events)
        GROUP BY a.event_id
    ),
    accounts AS (
        SELECT sca.user_id,
               sca.status,
               sca.charges_enabled,
               sca.payouts_enabled,
               e.id AS event_id
        FROM public.stripe_connect_accounts sca
        JOIN ended_events e ON sca.user_id = e.created_by
    )
    SELECT
        ee.id AS event_id,
        ee.title,
        ee.date AS event_date,
        ee.fee,
        ee.created_by,
        ee.created_at,
        COALESCE(s.paid_attendances_count,0) AS paid_attendances_count,
        COALESCE(s.total_stripe_sales,0)     AS total_stripe_sales,
        COALESCE(s.total_stripe_fee,0)       AS total_stripe_fee,
        0                                    AS platform_fee,
        COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0) AS net_payout_amount,
        a.charges_enabled,
        a.payouts_enabled,
        (a.status = 'verified' AND a.payouts_enabled) AS eligible,
        CASE
          WHEN a.status <> 'verified' THEN 'Stripe account not verified'
          WHEN NOT a.payouts_enabled THEN 'Payouts not enabled'
          ELSE NULL
        END AS ineligible_reason
    FROM ended_events ee
    LEFT JOIN sales s ON s.event_id = ee.id
    LEFT JOIN accounts a ON a.event_id = ee.id;
END;
$$;

-- 4) Drop column and enum (after all references removed)
ALTER TABLE public.events DROP COLUMN IF EXISTS status;
DROP TYPE IF EXISTS public.event_status_enum;

-- 5) Indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'events' AND indexname = 'idx_events_date') THEN
    CREATE INDEX idx_events_date ON public.events(date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'events' AND indexname = 'idx_events_created_by_date') THEN
    CREATE INDEX idx_events_created_by_date ON public.events(created_by, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'events' AND indexname = 'idx_events_canceled_at') THEN
    CREATE INDEX idx_events_canceled_at ON public.events(canceled_at);
  END IF;
END $$;

COMMIT;
