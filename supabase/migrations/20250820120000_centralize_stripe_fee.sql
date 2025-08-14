-- ====================================================================
-- 20250820120000 centralize stripe fee calculation
-- - 1) create calc_total_stripe_fee(UUID)
-- - 2) update process_event_payout to use the new function
-- - 3) update find_eligible_events_with_details to use the new function
-- ====================================================================

-- 1. Stripe手数料計算を一元化する関数
--    p_base_rate を省略した場合は fee_config テーブル、存在しなければ 0.036 を使用
CREATE OR REPLACE FUNCTION public.calc_total_stripe_fee(
    p_event_id UUID,
    p_base_rate NUMERIC DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_rate NUMERIC := COALESCE(p_base_rate, (SELECT stripe_base_rate FROM public.fee_config LIMIT 1), 0.036);
    v_total_fee INTEGER;
BEGIN
    SELECT COALESCE(SUM(ROUND(p.amount * v_rate)), 0)::INT
    INTO   v_total_fee
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status = 'paid';

    RETURN v_total_fee;
END;
$$;

COMMENT ON FUNCTION public.calc_total_stripe_fee(UUID, NUMERIC) IS 'イベント単位でStripe手数料を合計計算（各決済ごとに丸め）。';

-- 2. process_event_payout の更新
CREATE OR REPLACE FUNCTION public.process_event_payout(
    p_event_id UUID,
    p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payout_id UUID;
    existing_status payout_status_enum;
    stripe_sales INTEGER;
    stripe_fees INTEGER;
    platform_fees INTEGER := 0; -- MVP 段階
    net_amount INTEGER;
    stripe_account VARCHAR(255);
    lock_key BIGINT;
BEGIN
    -- バリデーション省略（既存実装と同様）
    IF p_event_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'event_id and user_id are required';
    END IF;

    -- アドバイザリロック
    lock_key := abs(hashtext(p_event_id::text));
    PERFORM pg_advisory_xact_lock(lock_key);

    -- 既存 pending 再利用チェック
    SELECT id, status
      INTO payout_id, existing_status
      FROM public.payouts
     WHERE event_id = p_event_id
     ORDER BY created_at DESC
     LIMIT 1;

    IF payout_id IS NOT NULL THEN
        IF existing_status = 'pending' THEN
            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists for event_id: %', p_event_id;
        END IF;
    END IF;

    -- Stripe Connect Account 取得 & 検証（簡略化）
    SELECT stripe_account_id INTO stripe_account
      FROM public.stripe_connect_accounts
     WHERE user_id = p_user_id AND payouts_enabled = true;
    IF stripe_account IS NULL THEN
        RAISE EXCEPTION 'Stripe Connect account not ready for user: %', p_user_id;
    END IF;

    -- 売上集計
    SELECT COALESCE(SUM(p.amount), 0)::INT
      INTO stripe_sales
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    -- 手数料を関数で取得
    stripe_fees := public.calc_total_stripe_fee(p_event_id);

    -- プラットフォーム手数料 0円 (MVP)
    net_amount := stripe_sales - stripe_fees - platform_fees;
    IF net_amount <= 0 THEN
        RAISE EXCEPTION 'Net payout amount <= 0 (calculated: %)', net_amount;
    END IF;

    -- レコード作成
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

COMMENT ON FUNCTION public.process_event_payout(UUID, UUID) IS 'イベント送金処理（手数料ロジックを calc_total_stripe_fee に委譲）。';

-- 3. find_eligible_events_with_details の更新
-- 既存関数を削除（パラメータ名変更のため）
DROP FUNCTION IF EXISTS public.find_eligible_events_with_details(integer, integer, integer);

-- 新版を作成
CREATE OR REPLACE FUNCTION public.find_eligible_events_with_details(
    p_minimum_amount INTEGER DEFAULT 100,
    p_skip INT DEFAULT 0,
    p_limit INT DEFAULT 100
) RETURNS TABLE (
    event_id UUID,
    title TEXT,
    event_date DATE,
    fee INTEGER,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    paid_attendances_count INTEGER,
    total_stripe_sales INTEGER,
    total_stripe_fee INTEGER,
    platform_fee INTEGER,
    net_payout_amount INTEGER,
    payouts_enabled BOOLEAN,
    eligible BOOLEAN,
    ineligible_reason TEXT
) LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH unprocessed_events AS (
      SELECT e.*
      FROM public.events e
      WHERE e.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM public.payouts p WHERE p.event_id = e.id
        )
      ORDER BY e.date
      OFFSET p_skip LIMIT p_limit
  ),
  sales AS (
      SELECT a.event_id, COUNT(*) AS paid_attendances_count, SUM(p.amount)::INT AS total_stripe_sales
      FROM public.attendances a
      JOIN public.payments p ON p.attendance_id = a.id
      WHERE p.method = 'stripe' AND p.status = 'paid'
      GROUP BY a.event_id
  ),
  accounts AS (
      SELECT sca.user_id, sca.payouts_enabled, e.id AS event_id
      FROM public.stripe_connect_accounts sca
      JOIN public.events e ON sca.user_id = e.created_by
  )
  SELECT
    ue.id AS event_id,
    ue.title,
    ue.date AS event_date,
    ue.fee,
    ue.created_by,
    ue.created_at,
    COALESCE(s.paid_attendances_count, 0) AS paid_attendances_count,
    COALESCE(s.total_stripe_sales, 0) AS total_stripe_sales,
    public.calc_total_stripe_fee(ue.id) AS total_stripe_fee,
    0 AS platform_fee,
    (COALESCE(s.total_stripe_sales, 0) - public.calc_total_stripe_fee(ue.id)) AS net_payout_amount,
    COALESCE(a.payouts_enabled, FALSE) AS payouts_enabled,
    (
      COALESCE(a.payouts_enabled, FALSE) = TRUE
      AND COALESCE(s.total_stripe_sales, 0) >= p_minimum_amount
      AND (COALESCE(s.total_stripe_sales, 0) - public.calc_total_stripe_fee(ue.id)) > 0
    ) AS eligible,
    CASE
      WHEN COALESCE(a.payouts_enabled, FALSE) = FALSE THEN 'Stripe Connectアカウントで送金が有効になっていません'
      WHEN COALESCE(s.total_stripe_sales, 0) < p_minimum_amount THEN '最小送金額の条件を満たしていません'
      WHEN (COALESCE(s.total_stripe_sales, 0) - public.calc_total_stripe_fee(ue.id)) <= 0 THEN '送金可能な金額がありません'
      ELSE NULL
    END AS ineligible_reason;
END;
$$;

COMMENT ON FUNCTION public.find_eligible_events_with_details(INTEGER, INTEGER, INTEGER)
  IS '送金候補イベントを取得（Stripe手数料を calc_total_stripe_fee で一元計算）';
