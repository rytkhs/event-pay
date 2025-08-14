-- ====================================================================
-- 送金処理RPC関数の更新: pending レコード再利用対応
-- ====================================================================

-- NOTE: タイムスタンプはファイル名に付与済み (20250815100000)
--       既存のアドバイザリロック付き実装をベースに、既存 pending 行が
--       存在する場合は例外ではなくその payout_id を返して再利用する。

CREATE OR REPLACE FUNCTION process_event_payout(
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
    SELECT id, status INTO payout_id, existing_status
    FROM public.payouts
    WHERE event_id = p_event_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF payout_id IS NOT NULL THEN
        -- pending の場合は再利用して返却、その他は例外
        IF existing_status = 'pending' THEN
            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
        END IF;
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
        0 -- MVP段階はプラットフォーム手数料0円
    INTO stripe_sales, stripe_fees, platform_fees
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status = 'paid';

    net_amount := stripe_sales - stripe_fees - platform_fees;

    -- 送金金額が0以下の場合はエラー
    IF net_amount <= 0 THEN
        RAISE EXCEPTION 'Net payout amount must be positive, calculated: %', net_amount;
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
        -- 並行処理でユニーク制約違反が発生した場合、直近 pending 行を再取得
        SELECT id INTO payout_id
        FROM public.payouts
        WHERE event_id = p_event_id AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1;

        IF payout_id IS NOT NULL THEN
            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
        END IF;
END;
$$;

COMMENT ON FUNCTION process_event_payout(UUID, UUID) IS 'イベントの送金処理を実行する関数（pending レコード再利用版）';
