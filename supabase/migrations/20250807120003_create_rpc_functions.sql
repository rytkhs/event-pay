-- ====================================================================
-- 決済・送金機能: RPC関数の実装
-- ====================================================================

-- 1. 決済レコード作成関数
CREATE OR REPLACE FUNCTION create_payment_record(
    p_attendance_id UUID,
    p_method payment_method_enum,
    p_amount INTEGER
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payment_id UUID;
BEGIN
    -- 入力値検証
    IF p_attendance_id IS NULL THEN
        RAISE EXCEPTION 'attendance_id cannot be null';
    END IF;
    
    IF p_amount < 0 THEN
        RAISE EXCEPTION 'amount must be non-negative, got: %', p_amount;
    END IF;
    
    -- 重複チェック
    IF EXISTS (SELECT 1 FROM public.payments WHERE attendance_id = p_attendance_id) THEN
        RAISE EXCEPTION 'Payment record already exists for attendance_id: %', p_attendance_id;
    END IF;
    
    -- attendanceレコードの存在確認
    IF NOT EXISTS (SELECT 1 FROM public.attendances WHERE id = p_attendance_id) THEN
        RAISE EXCEPTION 'Attendance record not found for id: %', p_attendance_id;
    END IF;
    
    -- 決済レコード作成
    INSERT INTO public.payments (attendance_id, method, amount, status)
    VALUES (p_attendance_id, p_method, p_amount, 'pending')
    RETURNING id INTO payment_id;
    
    RETURN payment_id;
END;
$$;

-- 2. イベント送金処理関数
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
BEGIN
    -- 入力値検証
    IF p_event_id IS NULL THEN
        RAISE EXCEPTION 'event_id cannot be null';
    END IF;
    
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null';
    END IF;
    
    -- イベントの存在確認と権限チェック
    IF NOT EXISTS (
        SELECT 1 FROM public.events 
        WHERE id = p_event_id AND created_by = p_user_id
    ) THEN
        RAISE EXCEPTION 'Event not found or user not authorized for event_id: %', p_event_id;
    END IF;
    
    -- 既存の送金レコードチェック
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
    
    -- 送金レコード作成（transfer_groupを生成）
    INSERT INTO public.payouts (
        event_id, user_id, total_stripe_sales, total_stripe_fee, 
        platform_fee, net_payout_amount, stripe_account_id, status, transfer_group
    )
    VALUES (
        p_event_id, p_user_id, stripe_sales, stripe_fees,
        platform_fees, net_amount, stripe_account, 'pending', 
        'EVENT_' || REPLACE(p_event_id::text, '-', '')
    )
    RETURNING id INTO payout_id;
    
    RETURN payout_id;
END;
$$;

-- 3. 売上集計更新関数
CREATE OR REPLACE FUNCTION update_revenue_summary(
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
    -- 入力値検証
    IF p_event_id IS NULL THEN
        RAISE EXCEPTION 'event_id cannot be null';
    END IF;
    
    -- イベントの存在確認
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
        RAISE EXCEPTION 'Event not found for id: %', p_event_id;
    END IF;
    
    -- 売上集計計算
    SELECT 
        COALESCE(SUM(CASE WHEN p.status IN ('paid', 'received', 'completed') THEN p.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.method = 'stripe' AND p.status = 'paid' THEN p.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.method = 'cash' AND p.status IN ('received', 'completed') THEN p.amount ELSE 0 END), 0),
        COUNT(CASE WHEN p.status IN ('paid', 'received', 'completed') THEN 1 END),
        COUNT(CASE WHEN p.status = 'pending' THEN 1 END)
    INTO total_revenue, stripe_revenue, cash_revenue, paid_count, pending_count
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id;
    
    -- 手数料計算（Stripe決済のみ: 各決済ごとに3.6% + 30円固定）
    SELECT COALESCE(SUM(ROUND(p.amount * 0.036)), 0)
    INTO total_fees
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id 
    AND p.method = 'stripe' 
    AND p.status = 'paid';
    net_revenue := total_revenue - total_fees;
    
    -- 結果をJSONで返す
    result := json_build_object(
        'event_id', p_event_id,
        'total_revenue', total_revenue,
        'stripe_revenue', stripe_revenue,
        'cash_revenue', cash_revenue,
        'paid_count', paid_count,
        'pending_count', pending_count,
        'total_fees', total_fees,
        'net_revenue', net_revenue,
        'updated_at', NOW()
    );
    
    RETURN result;
END;
$$;

-- 関数にコメントを追加
COMMENT ON FUNCTION create_payment_record(UUID, payment_method_enum, INTEGER) IS '決済レコードを作成する関数';
COMMENT ON FUNCTION process_event_payout(UUID, UUID) IS 'イベントの送金処理を実行する関数';
COMMENT ON FUNCTION update_revenue_summary(UUID) IS 'イベントの売上集計を更新・取得する関数';