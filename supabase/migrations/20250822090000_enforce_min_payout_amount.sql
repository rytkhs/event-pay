-- ====================================================================
-- 送金処理RPC関数の更新: 最小送金金額チェックを追加
-- ====================================================================

--       デフォルトでは 100 円未満の送金を禁止します。
--       将来的には get_min_payout_amount() 関数へ置き換えて一元管理する予定。

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
    -- 最小送金金額（将来的に app_config へ移動予定）
    min_payout CONSTANT INTEGER := 100;
BEGIN
    -- 入力値検証
    IF p_event_id IS NULL THEN
        RAISE EXCEPTION 'event_id cannot be null';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null';
    END IF;

    -- イベント固有のアドバイザリロックを取得
    lock_key := abs(hashtext(p_event_id::text));
    PERFORM pg_advisory_xact_lock(lock_key);

    -- イベントの存在確認と権限チェック
    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id AND created_by = p_user_id
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

    -- Stripe Connectアカウント取得
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
        0 -- プラットフォーム手数料（MVP は 0）
    INTO stripe_sales, stripe_fees, platform_fees
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status = 'paid';

    net_amount := stripe_sales - stripe_fees - platform_fees;

    -- 最小送金金額チェック
    IF net_amount < min_payout THEN
        RAISE EXCEPTION 'Net payout amount must be >= % yen, calculated: %', min_payout, net_amount;
    END IF;

    -- 送金レコード作成
    INSERT INTO public.payouts (
        event_id, user_id, total_stripe_sales, total_stripe_fee,
        platform_fee, net_payout_amount, stripe_account_id, status, transfer_group
    )
    VALUES (
        p_event_id, p_user_id, stripe_sales, stripe_fees,
        platform_fees, net_amount, stripe_account, 'pending',
        'event_' || p_event_id::text || '_payout'
    )
    RETURNING id INTO payout_id;

    RETURN payout_id;

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
END;
$$;

COMMENT ON FUNCTION process_event_payout(UUID, UUID) IS 'イベントの送金処理を実行する関数（最小送金額チェック追加版）';
