-- ====================================================================
-- 20250821090000 refactor update_revenue_summary fee calculation
-- - 1) update_revenue_summary を calc_total_stripe_fee に委譲
-- - 2) 固定 3.6% + 0 円 のマジックナンバーを除去
-- ====================================================================

-- 1. 既存関数の削除（あれば）
DROP FUNCTION IF EXISTS public.update_revenue_summary(UUID);

-- 2. 新版を作成
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
        RAISE EXCEPTION 'Event not found for id: %', p_event_id;
    END IF;

    -- 売上・件数集計
    SELECT
        COALESCE(SUM(CASE WHEN p.status IN ('paid', 'received', 'completed') THEN p.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.method = 'stripe' AND p.status = 'paid' THEN p.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.method = 'cash'   AND p.status IN ('received', 'completed') THEN p.amount ELSE 0 END), 0),
        COUNT(CASE WHEN p.status IN ('paid', 'received', 'completed') THEN 1 END),
        COUNT(CASE WHEN p.status = 'pending' THEN 1 END)
    INTO total_revenue, stripe_revenue, cash_revenue, paid_count, pending_count
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id;

    -- Stripe 手数料を共通関数で計算
    total_fees := public.calc_total_stripe_fee(p_event_id);

    net_revenue := total_revenue - total_fees;

    result := json_build_object(
        'event_id',        p_event_id,
        'total_revenue',   total_revenue,
        'stripe_revenue',  stripe_revenue,
        'cash_revenue',    cash_revenue,
        'paid_count',      paid_count,
        'pending_count',   pending_count,
        'total_fees',      total_fees,
        'net_revenue',     net_revenue,
        'updated_at',      NOW()
    );

    RETURN result;
END;
$$;

COMMENT ON FUNCTION public.update_revenue_summary(UUID) IS 'イベントの売上集計を更新・取得する関数（手数料は calc_total_stripe_fee に委譲）';
