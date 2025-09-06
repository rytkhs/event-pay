BEGIN;

-- Rename table payouts -> settlements
ALTER TABLE public.payouts RENAME TO settlements;

-- Rename indexes referencing payouts
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- generic helper to rename if exists
  PERFORM 1;
END $$;

-- Specific known indexes
ALTER INDEX IF EXISTS public.idx_payouts_user_id          RENAME TO idx_settlements_user_id;
ALTER INDEX IF EXISTS public.idx_payouts_event_id         RENAME TO idx_settlements_event_id;
ALTER INDEX IF EXISTS public.idx_payouts_status           RENAME TO idx_settlements_status;
ALTER INDEX IF EXISTS public.idx_payouts_stripe_transfer  RENAME TO idx_settlements_stripe_transfer;
ALTER INDEX IF EXISTS public.idx_payouts_stripe_account   RENAME TO idx_settlements_stripe_account;
ALTER INDEX IF EXISTS public.idx_payouts_transfer_group   RENAME TO idx_settlements_transfer_group;
ALTER INDEX IF EXISTS public.idx_payouts_event_generated_at RENAME TO idx_settlements_event_generated_at;
ALTER INDEX IF EXISTS public.idx_payouts_settlement_mode  RENAME TO idx_settlements_settlement_mode;
ALTER INDEX IF EXISTS public.idx_payouts_generated_date_jst RENAME TO idx_settlements_generated_date_jst;
ALTER INDEX IF EXISTS public.uniq_payouts_event_generated_date_jst RENAME TO uniq_settlements_event_generated_date_jst;

-- Rename unique constraint (automatically created with unique index)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uniq_payouts_event_generated_date_jst'
    AND table_name = 'settlements'
    AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.settlements RENAME CONSTRAINT uniq_payouts_event_generated_date_jst TO uniq_settlements_event_generated_date_jst;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.unique_active_payout_per_event RENAME TO unique_active_settlement_per_event;

-- Update RLS policies comments and names (drop and recreate with same logic)
DROP POLICY IF EXISTS "Users can view own payouts" ON public.settlements;
DROP POLICY IF EXISTS users_can_view_own_payouts ON public.settlements;
DROP POLICY IF EXISTS event_creators_can_view_payouts ON public.settlements;
DROP POLICY IF EXISTS event_creators_can_view_settlement_reports ON public.settlements;
DROP POLICY IF EXISTS "Service role can manage payouts" ON public.settlements;

CREATE POLICY "Users can view own settlements" ON public.settlements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY users_can_view_own_settlements ON public.settlements FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY event_creators_can_view_settlements ON public.settlements FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = settlements.event_id
      AND e.created_by = auth.uid()
  )
);
CREATE POLICY "Service role can manage settlements" ON public.settlements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Triggers
DROP TRIGGER IF EXISTS update_payouts_updated_at ON public.settlements;
CREATE TRIGGER update_settlements_updated_at BEFORE UPDATE ON public.settlements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.settlements IS '運営者への売上清算履歴（レポート・スナップショット用途）';
COMMENT ON COLUMN public.settlements.settlement_mode IS '送金モード（destination_charge固定）';
COMMENT ON COLUMN public.settlements.generated_at IS 'レポート生成日時';
COMMENT ON COLUMN public.settlements.transfer_group IS 'イベント単位の送金グループ識別子';
COMMENT ON COLUMN public.settlements.stripe_account_id IS 'Stripe Connect Account ID';
COMMENT ON COLUMN public.settlements.retry_count IS '清算処理のリトライ回数';
COMMENT ON COLUMN public.settlements.last_error IS '最後に発生したエラーメッセージ';

-- Update all function references from payouts to settlements
-- First drop existing functions that need parameter changes
DROP FUNCTION IF EXISTS public.process_event_payout(UUID, UUID);
DROP FUNCTION IF EXISTS public.generate_settlement_report(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_settlement_report_details(UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.process_event_payout(
  input_event_id UUID,
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
    platform_fees INTEGER := 0; -- MVP では 0 円
    net_amount INTEGER;
    stripe_account VARCHAR(255);
    lock_key BIGINT;
BEGIN
    -- 必須入力チェック
    IF input_event_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'event_id and user_id cannot be null';
    END IF;

    -- イベント固有ロック
    lock_key := abs(hashtext(input_event_id::text));
    PERFORM pg_advisory_xact_lock(lock_key);

    -- 権限＆存在確認
    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = input_event_id AND created_by = p_user_id AND status = 'past'
    ) THEN
        RAISE EXCEPTION 'Event not found or not authorized: %', input_event_id;
    END IF;

    -- 既存送金レコードチェック（最新行）
    SELECT id, status INTO payout_id, existing_status
    FROM public.settlements
    WHERE event_id = input_event_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF payout_id IS NOT NULL THEN
        -- pending の場合はそのまま再利用して返却
        IF existing_status = 'pending' THEN
            RETURN payout_id;
        ELSIF existing_status = 'failed' THEN
            -- failed を pending にリセットして再利用
            UPDATE public.settlements
            SET status = 'pending',
                processed_at = NULL,
                last_error = NULL
            WHERE id = payout_id
            RETURNING id INTO payout_id;

            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', input_event_id;
        END IF;
    END IF;

    -- Stripe Connect account (verified & charges_enabled & payouts_enabled) 取得
    SELECT stripe_account_id INTO stripe_account
      FROM public.stripe_connect_accounts
     WHERE user_id = p_user_id
       AND status = 'verified'
       AND charges_enabled = true
       AND payouts_enabled = true;
    IF stripe_account IS NULL THEN
        RAISE EXCEPTION 'No verified Stripe Connect account for user: %', p_user_id;
    END IF;

    -- 売上合計
    SELECT COALESCE(SUM(p.amount),0)::INT INTO stripe_sales
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = input_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    -- Stripe 手数料 (割合+固定)
    stripe_fees := public.calc_total_stripe_fee(input_event_id);

    -- プラットフォーム手数料 (将来対応) 今は 0

    net_amount := stripe_sales - stripe_fees - platform_fees;

    -- 最小送金金額チェック
    IF net_amount < public.get_min_payout_amount() THEN
        RAISE EXCEPTION 'Net payout amount < minimum (%). Calculated: %', public.get_min_payout_amount(), net_amount;
    END IF;

    -- 送金レコード作成
    INSERT INTO public.settlements (
        event_id, user_id, total_stripe_sales, total_stripe_fee,
        platform_fee, net_payout_amount, stripe_account_id, status, transfer_group
    ) VALUES (
        input_event_id, p_user_id, stripe_sales, stripe_fees,
        platform_fees, net_amount, stripe_account, 'pending',
        'event_' || input_event_id::text || '_payout'
    ) RETURNING id INTO payout_id;

    RETURN payout_id;

EXCEPTION
    WHEN unique_violation THEN
        -- 並行処理でユニーク制約違反が発生した場合、最新 pending / failed を再取得
        SELECT id, status INTO payout_id, existing_status
        FROM public.settlements
        WHERE event_id = input_event_id
        ORDER BY created_at DESC
        LIMIT 1;

        IF payout_id IS NOT NULL AND existing_status IN ('pending', 'failed') THEN
            -- failed の場合はリセットして返す
            IF existing_status = 'failed' THEN
                UPDATE public.settlements
                SET status = 'pending',
                    processed_at = NULL,
                    last_error = NULL
                WHERE id = payout_id;
            END IF;
            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', input_event_id;
        END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_payout_status_safe(
    _payout_id uuid,
    _from_status public.payout_status_enum,
    _to_status   public.payout_status_enum,
    _processed_at timestamptz default null,
    _transfer_group text      default null,
    _last_error text          default null,
    _notes text               default null
) returns void
language plpgsql
as $$
begin
    update public.settlements
    set status             = _to_status,
        processed_at       = coalesce(_processed_at, processed_at),
        transfer_group     = coalesce(_transfer_group, transfer_group),
        last_error         = coalesce(_last_error, last_error),
        notes              = coalesce(_notes, notes)
    where id = _payout_id
      and status = _from_status;

    if not found then
        raise exception 'payout status conflict or not found'
            using errcode = '40001'; -- serialization_failure 相当
    end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.generate_settlement_report(
    input_event_id UUID,
    input_created_by UUID
) RETURNS TABLE (
    report_id UUID,
    already_exists BOOLEAN,
    returned_event_id UUID,
    event_title VARCHAR(255),
    event_date TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    stripe_account_id VARCHAR(255),
    transfer_group TEXT,
    total_stripe_sales INTEGER,
    total_stripe_fee INTEGER,
    total_application_fee INTEGER,
    net_payout_amount INTEGER,
    payment_count INTEGER,
    refunded_count INTEGER,
    total_refunded_amount INTEGER,
    settlement_mode TEXT,
    report_generated_at TIMESTAMPTZ,
    report_updated_at TIMESTAMPTZ
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
    END IF;

    -- Net application fee (cannot be negative)
    v_net_application_fee := GREATEST(v_application_fee - v_total_app_fee_refunded, 0);

    -- Net payout amount (Stripe fee is platform-borne)
    v_net_amount := (v_stripe_sales - v_total_refunded_amount) - v_net_application_fee;

    -- Atomic upsert by (event_id, JST date)
    INSERT INTO public.settlements (
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
        input_event_id,
        input_created_by,
        v_stripe_sales,
        v_stripe_fee,
        v_net_application_fee,
        v_net_amount,
        v_event_data.stripe_account_id,
        v_transfer_group,
        'destination_charge',
        'completed',
        now()
    )
    ON CONFLICT (event_id, (DATE(generated_at AT TIME ZONE 'Asia/Tokyo'))) DO UPDATE SET
        total_stripe_sales = EXCLUDED.total_stripe_sales,
        total_stripe_fee   = EXCLUDED.total_stripe_fee,
        platform_fee       = EXCLUDED.platform_fee,
        net_payout_amount  = EXCLUDED.net_payout_amount
    RETURNING id, (xmax = 0), public.settlements.generated_at, public.settlements.updated_at
    INTO v_payout_id, v_was_update, v_generated_at, v_updated_at;

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
    settlement_mode := 'destination_charge';
    report_generated_at := v_generated_at;
    report_updated_at := v_updated_at;

    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_settlement_report_details(
    input_created_by UUID,
    input_event_ids UUID[] DEFAULT NULL,
    p_from_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
    report_id UUID,
    event_id UUID,
    event_title VARCHAR(255),
    event_date TIMESTAMP WITH TIME ZONE,
    stripe_account_id VARCHAR(255),
    transfer_group VARCHAR(255),
    generated_at TIMESTAMP WITH TIME ZONE,

    total_stripe_sales INTEGER,
    total_stripe_fee INTEGER,
    total_application_fee INTEGER,
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
        p.net_payout_amount,

        -- 決済件数を動的に取得
        (
            SELECT COUNT(*)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.status = 'paid'
        ) AS payment_count,

        -- 返金件数・金額を動的に取得
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
    FROM public.settlements p
    JOIN public.events e ON p.event_id = e.id
    WHERE p.user_id = input_created_by
      AND p.settlement_mode = 'destination_charge'
      AND (input_event_ids IS NULL OR p.event_id = ANY(input_event_ids))
      AND (p_from_date IS NULL OR p.generated_at >= p_from_date)
      AND (p_to_date IS NULL OR p.generated_at <= p_to_date)
    ORDER BY p.generated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Update cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_test_tables_dev_only()
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
    -- 警告: この関数は開発環境専用です。本番環境で実行しないでください。
    RAISE WARNING 'Executing development-only cleanup function. This should not be run in production.';

    DELETE FROM public.settlements;
    DELETE FROM public.payments;
    DELETE FROM public.attendances;
    DELETE FROM public.invite_links;
    DELETE FROM public.events;
    DELETE FROM public.stripe_connect_accounts;
    DELETE FROM public.users;
    -- auth.usersは別途テストコードで管理
    RAISE NOTICE 'Test data cleanup completed for all public tables.';
END;
$$;

COMMIT;
