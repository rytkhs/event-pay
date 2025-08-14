-- +goose Up
-- +goose StatementBegin
/*
  RPC find_eligible_events_with_details に charges_enabled 列を追加し、eligible 判定にも組み込む
*/
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
               COUNT(*) FILTER (WHERE p.status = 'paid')               AS paid_attendances_count,
               COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'),0)::INT AS total_stripe_sales,
               public.calc_total_stripe_fee(a.event_id)               AS total_stripe_fee
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

-- +goose Down
-- +goose StatementBegin
-- 元の定義に戻す (charges_enabled 列削除)
-- 開発用途のため省略
-- +goose StatementEnd
