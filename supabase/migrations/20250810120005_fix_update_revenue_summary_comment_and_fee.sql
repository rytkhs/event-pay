-- ====================================================================
-- update_revenue_summary: コメント整合と手数料算出規約の明確化
-- 手数料は「各決済ごとに丸めて合計」に統一
-- 固定手数料は現状 0 円（導入時は同様の規約で加算する）
-- ====================================================================

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
    IF p_event_id IS NULL THEN
        RAISE EXCEPTION 'event_id cannot be null';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
        RAISE EXCEPTION 'Event not found for id: %', p_event_id;
    END IF;

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

    -- Stripe手数料: 各決済ごとに丸めた手数料の合計（3.6% + 固定0円）
    SELECT COALESCE(SUM(ROUND(p.amount * 0.036 + 0)), 0)
    INTO total_fees
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
    AND p.method = 'stripe'
    AND p.status = 'paid';

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
        'updated_at', NOW()
    );

    RETURN result;
END;
$$;

COMMENT ON FUNCTION update_revenue_summary(UUID) IS 'イベントの売上集計を更新・取得する関数（手数料は各決済単位で丸めて合計）';
