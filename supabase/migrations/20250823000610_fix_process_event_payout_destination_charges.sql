BEGIN;

-- Align process_event_payout with Destination charges
-- - Remove references to payouts.stripe_transfer_id (column dropped)
-- - Relax Stripe account requirement: only payouts_enabled is required (charges_enabled not required)
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
        WHERE id = p_event_id AND created_by = p_user_id AND status = 'past'
    ) THEN
        RAISE EXCEPTION 'Event not found or not authorized: %', p_event_id;
    END IF;

    -- 既存送金レコードチェック（最新行）
    SELECT id, status INTO payout_id, existing_status
    FROM public.payouts
    WHERE event_id = p_event_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF payout_id IS NOT NULL THEN
        -- pending の場合はそのまま再利用して返却
        IF existing_status = 'pending' THEN
            RETURN payout_id;
        ELSIF existing_status = 'failed' THEN
            -- failed を pending にリセットして再利用（stripe_transfer_id は既に廃止）
            UPDATE public.payouts
            SET status = 'pending',
                processed_at = NULL,
                last_error = NULL,
                updated_at = now()
            WHERE id = payout_id
            RETURNING id INTO payout_id;

            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
        END IF;
    END IF;

    -- Stripe Connect account (verified & payouts_enabled) 取得
    SELECT stripe_account_id INTO stripe_account
      FROM public.stripe_connect_accounts
     WHERE user_id = p_user_id
       AND status = 'verified'
       AND payouts_enabled = true;
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

EXCEPTION
    WHEN unique_violation THEN
        -- 並行処理でユニーク制約違反が発生した場合、最新 pending / failed を再取得
        SELECT id, status INTO payout_id, existing_status
        FROM public.payouts
        WHERE event_id = p_event_id
        ORDER BY created_at DESC
        LIMIT 1;

        IF payout_id IS NOT NULL AND existing_status IN ('pending', 'failed') THEN
            -- failed の場合はリセットして返す（stripe_transfer_id は既に廃止）
            IF existing_status = 'failed' THEN
                UPDATE public.payouts
                SET status = 'pending',
                    processed_at = NULL,
                    last_error = NULL,
                    updated_at = now()
                WHERE id = payout_id;
            END IF;
            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
        END IF;
END;
$$;

COMMENT ON FUNCTION public.process_event_payout(UUID,UUID) IS 'イベント送金処理（Destination charges対応）: payouts_enabled のみ必須。stripe_transfer_id は不使用。';

COMMIT;
