-- +goose Up
-- +goose StatementBegin

/*
  強化: Stripe Connect アカウント取得条件に charges_enabled = true を追加
  既存プロシージャ public.process_event_payout(UUID, UUID) を置換
*/

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

    -- Stripe Connect account (verified & charges_enabled & payouts_enabled) 取得
    SELECT stripe_account_id INTO stripe_account
      FROM public.stripe_connect_accounts
     WHERE user_id = p_user_id
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

COMMENT ON FUNCTION public.process_event_payout(UUID,UUID) IS 'イベント送金処理: charges_enabled 条件を追加し送金前検証を強化';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- 元に戻す手順 (charges_enabled 条件を除外)
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
     WHERE user_id = p_user_id AND payouts_enabled = true;
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
-- +goose StatementEnd
