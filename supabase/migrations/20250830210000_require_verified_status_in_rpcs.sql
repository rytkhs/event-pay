-- +goose Up
-- +goose StatementBegin
/*
  強化: Stripe Connect アカウントが status = 'verified' であることを RPC レベルでも必須とする
  対象:
    1. process_event_payout(UUID, UUID)
    2. find_eligible_events_with_details(INT, INT)
*/

-- ===================================================================
-- 1. process_event_payout
-- ===================================================================
CREATE OR REPLACE FUNCTION public.process_event_payout(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stripe_sales INTEGER := 0;
    stripe_fees INTEGER := 0;
    platform_fees INTEGER := 0;
    net_amount INTEGER := 0;
    payout_id UUID;
    stripe_account TEXT;
BEGIN
    IF p_event_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'event_id / user_id cannot be null';
    END IF;

    -- イベント存在 & 権限確認
    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id AND created_by = p_user_id AND status = 'past'
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

    -- Stripe Connect account 取得 (verified & charges_enabled & payouts_enabled)
    SELECT stripe_account_id INTO stripe_account
      FROM public.stripe_connect_accounts
     WHERE user_id = p_user_id
       AND status = 'verified'
       AND charges_enabled = true
       AND payouts_enabled = true;
    IF stripe_account IS NULL THEN
        RAISE EXCEPTION 'No verified Stripe Connect account for user: %', p_user_id;
    END IF;

    -- 売上合計 (Stripe paid 決済のみ)
    SELECT COALESCE(SUM(p.amount),0)::INT INTO stripe_sales
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    -- Stripe 手数料 + プラットフォーム手数料
    stripe_fees := public.calc_total_stripe_fee(p_event_id);
    -- プラットフォーム手数料は現状 0

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

COMMENT ON FUNCTION public.process_event_payout(UUID,UUID) IS 'イベント送金処理: verified / charges_enabled / payouts_enabled の三点チェックを追加';

-- ===================================================================
-- 2. find_eligible_events_with_details
-- ===================================================================
CREATE OR REPLACE FUNCTION public.find_eligible_events_with_details(
    p_days_after_event INT DEFAULT 5,
    p_limit INT DEFAULT 50
) RETURNS TABLE (
    event_id UUID,
    title TEXT,
    event_date DATE,
    fee INT,
    created_by UUID,
    created_at TIMESTAMPTZ,
    paid_attendances_count INT,
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
    WITH unpaid_events AS (
        SELECT e.*
        FROM public.events e
        WHERE e.status = 'past'
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
        WHERE a.event_id IN (SELECT id FROM unpaid_events)
        GROUP BY a.event_id
    ),
    accounts AS (
        SELECT sca.user_id,
               sca.status,
               sca.charges_enabled,
               sca.payouts_enabled,
               e.id AS event_id
        FROM public.stripe_connect_accounts sca
        JOIN unpaid_events e ON sca.user_id = e.created_by
    )
    SELECT
        ue.id AS event_id,
        ue.title,
        ue.date AS event_date,
        ue.fee,
        ue.created_by,
        ue.created_at,
        COALESCE(s.paid_attendances_count,0),
        COALESCE(s.total_stripe_sales,0),
        COALESCE(s.total_stripe_fee,0),
        0 AS platform_fee,
        (COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0)) AS net_payout_amount,
        COALESCE(a.charges_enabled,false) AS charges_enabled,
        COALESCE(a.payouts_enabled,false) AS payouts_enabled,
        (
          COALESCE(a.status,'unverified') = 'verified' AND
          COALESCE(a.charges_enabled,false) = TRUE AND
          COALESCE(a.payouts_enabled,false) = TRUE AND
          (COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0)) >= public.get_min_payout_amount()
        ) AS eligible,
        CASE
            WHEN COALESCE(a.status,'unverified') <> 'verified' THEN 'Stripe Connectアカウントの認証が完了していません'
            WHEN COALESCE(a.charges_enabled,false) = FALSE THEN 'Stripe Connectアカウントで決済受取が有効になっていません'
            WHEN COALESCE(a.payouts_enabled,false) = FALSE THEN 'Stripe Connectアカウントで送金が有効になっていません'
            WHEN (COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0)) < public.get_min_payout_amount() THEN '最小送金額の条件を満たしていません'
            ELSE NULL
        END AS ineligible_reason
    FROM unpaid_events ue
    LEFT JOIN sales s ON s.event_id = ue.id
    LEFT JOIN accounts a ON a.event_id = ue.id;
END;
$$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
/* ダウン: status 条件を除外して元に戻す（charges_enabled / payouts_enabled のみ版）
   最新の 20250830093000 / 20250830095000 時点の定義にロールバックする */

-- 1. process_event_payout (status 条件を外す)
CREATE OR REPLACE FUNCTION public.process_event_payout(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stripe_sales INTEGER := 0;
    stripe_fees INTEGER := 0;
    platform_fees INTEGER := 0;
    net_amount INTEGER := 0;
    payout_id UUID;
    stripe_account TEXT;
BEGIN
    IF p_event_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'event_id / user_id cannot be null';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id AND created_by = p_user_id AND status = 'past'
    ) THEN
        RAISE EXCEPTION 'Event not found or not authorized: %', p_event_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.payouts
        WHERE event_id = p_event_id AND status IN ('pending','processing','completed')
    ) THEN
        RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
    END IF;

    SELECT stripe_account_id INTO stripe_account
      FROM public.stripe_connect_accounts
     WHERE user_id = p_user_id
       AND charges_enabled = true
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

COMMENT ON FUNCTION public.process_event_payout(UUID,UUID) IS 'イベント送金処理: charges_enabled 条件を追加し送金前検証を強化';

-- 2. find_eligible_events_with_details (status 条件を外す)
CREATE OR REPLACE FUNCTION public.find_eligible_events_with_details(
    p_days_after_event INT DEFAULT 5,
    p_limit INT DEFAULT 50
) RETURNS TABLE (
    event_id UUID,
    title TEXT,
    event_date DATE,
    fee INT,
    created_by UUID,
    created_at TIMESTAMPTZ,
    paid_attendances_count INT,
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
    WITH unpaid_events AS (
        SELECT e.*
        FROM public.events e
        WHERE e.status = 'past'
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
        WHERE a.event_id IN (SELECT id FROM unpaid_events)
        GROUP BY a.event_id
    ),
    accounts AS (
        SELECT sca.user_id,
               sca.charges_enabled,
               sca.payouts_enabled,
               e.id AS event_id
        FROM public.stripe_connect_accounts sca
        JOIN unpaid_events e ON sca.user_id = e.created_by
    )
    SELECT
        ue.id AS event_id,
        ue.title,
        ue.date AS event_date,
        ue.fee,
        ue.created_by,
        ue.created_at,
        COALESCE(s.paid_attendances_count,0),
        COALESCE(s.total_stripe_sales,0),
        COALESCE(s.total_stripe_fee,0),
        0 AS platform_fee,
        (COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0)) AS net_payout_amount,
        COALESCE(a.charges_enabled,false) AS charges_enabled,
        COALESCE(a.payouts_enabled,false) AS payouts_enabled,
        (
          COALESCE(a.charges_enabled,false) = TRUE AND
          COALESCE(a.payouts_enabled,false) = TRUE AND
          (COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0)) >= public.get_min_payout_amount()
        ) AS eligible,
        CASE
            WHEN COALESCE(a.charges_enabled,false) = FALSE THEN 'Stripe Connectアカウントで決済受取が有効になっていません'
            WHEN COALESCE(a.payouts_enabled,false) = FALSE THEN 'Stripe Connectアカウントで送金が有効になっていません'
            WHEN (COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0)) < public.get_min_payout_amount() THEN '最小送金額の条件を満たしていません'
            ELSE NULL
        END AS ineligible_reason
    FROM unpaid_events ue
    LEFT JOIN sales s ON s.event_id = ue.id
    LEFT JOIN accounts a ON a.event_id = ue.id;
END;
$$;
-- +goose StatementEnd
