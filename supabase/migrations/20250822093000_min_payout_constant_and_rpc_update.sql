-- ====================================================================
-- 最小送金金額を DB で一元管理し、RPC に反映するマイグレーション
-- ====================================================================
-- 1. get_min_payout_amount() 関数を追加（当面は定数 100 円を返す）
-- 2. process_event_payout 関数を更新して同関数を参照し、
--    net_amount < get_min_payout_amount() の場合にエラーを投げる
-- ====================================================================

-- 1) ユーティリティ関数の追加
CREATE OR REPLACE FUNCTION get_min_payout_amount()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    -- 将来的には設定テーブルや Supabase の環境変数を参照する実装に差し替える
    SELECT 100;
$$;

COMMENT ON FUNCTION get_min_payout_amount() IS '最小送金金額（円）を返すユーティリティ関数。現時点では定数 100 円。';

-- 2) process_event_payout の更新
CREATE OR REPLACE FUNCTION process_event_payout(
    p_event_id UUID,
    p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payout_id UUID;
    stripe_sales INTEGER;
    stripe_fees INTEGER;
    platform_fees INTEGER;
    net_amount INTEGER;
    stripe_account VARCHAR(255);
    lock_key BIGINT;
BEGIN
    -- 入力値検証
    IF p_event_id IS NULL THEN
        RAISE EXCEPTION 'event_id cannot be null';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null';
    END IF;

    -- イベント固有のアドバイザリロック取得
    lock_key := abs(hashtext(p_event_id::text));
    PERFORM pg_advisory_xact_lock(lock_key);

    -- イベント存在 + 権限確認
    IF NOT EXISTS (
        SELECT 1 FROM public.events WHERE id = p_event_id AND created_by = p_user_id
    ) THEN
        RAISE EXCEPTION 'Event not found or user not authorized for event_id: %', p_event_id;
    END IF;

    -- 既存送金レコードチェック
    IF EXISTS (
        SELECT 1 FROM public.payouts
        WHERE event_id = p_event_id AND status IN ('pending', 'processing', 'completed')
    ) THEN
        RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
    END IF;

    -- Stripe Connect アカウント確認
    SELECT stripe_account_id INTO stripe_account
    FROM public.stripe_connect_accounts
    WHERE user_id = p_user_id AND payouts_enabled = true;
    IF stripe_account IS NULL THEN
        RAISE EXCEPTION 'No verified Stripe Connect account found for user: %', p_user_id;
    END IF;

    -- 売上集計
    SELECT
        COALESCE(SUM(p.amount), 0),
        COALESCE(SUM(ROUND(p.amount * 0.036)), 0), -- Stripe手数料 3.6%
        0 -- プラットフォーム手数料（MVP 段階 0 円）
    INTO stripe_sales, stripe_fees, platform_fees
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status = 'paid';

    net_amount := stripe_sales - stripe_fees - platform_fees;

    -- ★ 最小送金金額チェック ★
    IF net_amount < get_min_payout_amount() THEN
        RAISE EXCEPTION 'Net payout amount must be >= % yen, calculated: %', get_min_payout_amount(), net_amount;
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

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
END;
$$;

COMMENT ON FUNCTION process_event_payout(UUID, UUID) IS 'イベントの送金処理を実行する関数（最小送金額チェック・一元管理版）';
