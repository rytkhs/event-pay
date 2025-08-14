-- ====================================================================
-- 20250825092000 update RPCs with fee_config based helpers
--   * process_event_payout        : uses calc_total_stripe_fee / get_min_payout_amount
--   * update_revenue_summary      : ditto
--   * find_eligible_events_basic  : uses both helpers for eligibility
-- ====================================================================

/* -------------------------------------------------------------
 * 1. process_event_payout
 * ------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.process_event_payout(
    p_event_id UUID,
    p_user_id  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payout_id UUID;
    stripe_sales INTEGER;
    stripe_fees  INTEGER;
    platform_fees INTEGER := 0; -- MVP では 0 円
    net_amount INTEGER;
    stripe_account VARCHAR(255);
    lock_key BIGINT;
BEGIN
    -- 必須入力チェック
    IF p_event_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'event_id and user_id cannot be null';
    END IF;

    -- イベント固有ロック
    lock_key := abs(hashtext(p_event_id::text));
    PERFORM pg_advisory_xact_lock(lock_key);

    -- 権限＆存在確認
    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id AND created_by = p_user_id
    ) THEN
        RAISE EXCEPTION 'Event not found or not authorized: %', p_event_id;
    END IF;

    -- 既存送金チェック
    IF EXISTS (
        SELECT 1 FROM public.payouts
        WHERE event_id = p_event_id AND status IN ('pending','processing','completed')
    ) THEN
        RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
    END IF;

    -- Stripe Connect account (verified & payouts_enabled) 取得
    SELECT stripe_account_id INTO stripe_account
      FROM public.stripe_connect_accounts
     WHERE user_id = p_user_id AND payouts_enabled = true;
    IF stripe_account IS NULL THEN
        RAISE EXCEPTION 'No verified Stripe Connect account for user: %', p_user_id;
    END IF;

    -- 売上合計
    SELECT COALESCE(SUM(p.amount),0)::INT INTO stripe_sales
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    -- Stripe 手数料 (割合+固定)
    stripe_fees := public.calc_total_stripe_fee(p_event_id);

    -- プラットフォーム手数料 (将来対応) 今は 0

    net_amount := stripe_sales - stripe_fees - platform_fees;

    -- 最小送金金額チェック
    IF net_amount < public.get_min_payout_amount() THEN
        RAISE EXCEPTION 'Net payout amount < minimum (%). Calculated: %', public.get_min_payout_amount(), net_amount;
    END IF;

    -- 送金レコード作成
    INSERT INTO public.payouts (
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

COMMENT ON FUNCTION public.process_event_payout(UUID,UUID) IS 'イベント送金処理：fee_config ベースで手数料・最小送金金額を計算';

/* -------------------------------------------------------------
 * 2. update_revenue_summary
 * ------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.update_revenue_summary(
    p_event_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_revenue INTEGER;
    stripe_revenue INTEGER;
    cash_revenue INTEGER;
    paid_count INTEGER;
    pending_count INTEGER;
    total_fees INTEGER;
    net_revenue INTEGER;
    result JSON;
BEGIN
    IF p_event_id IS NULL THEN
        RAISE EXCEPTION 'event_id cannot be null';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
        RAISE EXCEPTION 'Event not found: %', p_event_id;
    END IF;

    -- 売上集計
    SELECT
        COALESCE(SUM(CASE WHEN p.status IN ('paid','received','completed') THEN p.amount ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN p.method='stripe' AND p.status='paid' THEN p.amount ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN p.method='cash' AND p.status IN ('received','completed') THEN p.amount ELSE 0 END),0),
        COUNT(CASE WHEN p.status IN ('paid','received','completed') THEN 1 END),
        COUNT(CASE WHEN p.status='pending' THEN 1 END)
      INTO total_revenue, stripe_revenue, cash_revenue, paid_count, pending_count
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id;

    -- Stripe 手数料を共通関数で取得
    total_fees := public.calc_total_stripe_fee(p_event_id);
    net_revenue := total_revenue - total_fees;

    result := json_build_object(
        'event_id', p_event_id,
        'total_revenue', total_revenue,
        'stripe_revenue', stripe_revenue,
        'cash_revenue', cash_revenue,
        'paid_count', paid_count,
        'pending_count', pending_count,
        'total_fees', total_fees,
        'net_revenue', net_revenue,
        'updated_at', now()
    );
    RETURN result;
END;
$$;

COMMENT ON FUNCTION public.update_revenue_summary(UUID) IS 'イベント売上サマリー: fee_config ベースの手数料計算';

/* -------------------------------------------------------------
 * 3. find_eligible_events_basic
 *   - 既存バージョンを上書き: 最小送金金額取得に get_min_payout_amount
 * ------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.find_eligible_events_basic(
    p_days_after_event INTEGER DEFAULT 5,
    p_minimum_amount  INTEGER DEFAULT NULL,
    p_limit           INTEGER DEFAULT 100,
    p_user_id         UUID DEFAULT NULL
) RETURNS TABLE (
    event_id UUID,
    title TEXT,
    event_date DATE,
    fee INTEGER,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    paid_attendances_count INTEGER,
    total_stripe_sales INTEGER
) LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH target_events AS (
        SELECT e.*
          FROM public.events e
         WHERE e.status = 'past'
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

COMMENT ON FUNCTION public.find_eligible_events_basic(INTEGER,INTEGER,INTEGER,UUID) IS '送金対象イベント検索 (fee_config ベースの最小送金金額利用)';
