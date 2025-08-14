-- ====================================================================
-- 自動送金スケジューラ最適化: 詳細判定をRPCで一括処理
-- 目的: アプリ側のN+1クエリ解消のため、候補イベントの判定と金額計算をDB側で集約
-- ====================================================================

CREATE OR REPLACE FUNCTION find_eligible_events_with_details(
  p_days_after_event INTEGER DEFAULT 5,
  p_minimum_amount INTEGER DEFAULT 100,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  event_id UUID,
  title TEXT,
  event_date DATE,
  fee INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ,
  paid_attendances_count INTEGER,
  total_stripe_sales INTEGER,
  total_stripe_fee INTEGER,
  platform_fee INTEGER,
  net_payout_amount INTEGER,
  payouts_enabled BOOLEAN,
  eligible BOOLEAN,
  ineligible_reason TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH candidate_events AS (
    SELECT
      e.id AS event_id,
      e.title,
      e.date AS event_date,
      e.fee,
      e.created_by,
      e.created_at
    FROM public.events e
    WHERE e.status = 'past'
      AND e.date <= (CURRENT_DATE - (p_days_after_event || ' days')::INTERVAL)::DATE
    ORDER BY e.date ASC
    LIMIT p_limit
  ),
  -- 既存送金の除外
  unprocessed_events AS (
    SELECT ce.*
    FROM candidate_events ce
    LEFT JOIN public.payouts po
      ON po.event_id = ce.event_id
      AND po.status IN ('pending','processing','completed')
    WHERE po.event_id IS NULL
  ),
  sales AS (
    SELECT
      ce.event_id,
      COUNT(p.id) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid') AS paid_attendances_count,
      COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid'), 0) AS total_stripe_sales
    FROM unprocessed_events ce
    LEFT JOIN public.attendances a ON a.event_id = ce.event_id
    LEFT JOIN public.payments p ON p.attendance_id = a.id
    GROUP BY ce.event_id
  ),
  accounts AS (
    SELECT
      ce.event_id,
      sca.payouts_enabled
    FROM unprocessed_events ce
    LEFT JOIN public.stripe_connect_accounts sca
      ON sca.user_id = ce.created_by
  )
  SELECT
    ue.event_id,
    ue.title,
    ue.event_date,
    ue.fee,
    ue.created_by,
    ue.created_at,
    COALESCE(s.paid_attendances_count, 0) AS paid_attendances_count,
    COALESCE(s.total_stripe_sales, 0) AS total_stripe_sales,
    -- Stripe手数料: 各決済3.6%の近似として合計額に対する丸め。厳密には各決済で丸める必要があるがMVPでは許容。
    COALESCE(ROUND(COALESCE(s.total_stripe_sales, 0) * 0.036), 0)::INT AS total_stripe_fee,
    0 AS platform_fee,
    (COALESCE(s.total_stripe_sales, 0)
      - COALESCE(ROUND(COALESCE(s.total_stripe_sales, 0) * 0.036), 0)
      - 0)::INT AS net_payout_amount,
    COALESCE(a.payouts_enabled, FALSE) AS payouts_enabled,
    -- 判定
    (
      COALESCE(a.payouts_enabled, FALSE) = TRUE
      AND COALESCE(s.total_stripe_sales, 0) >= p_minimum_amount
      AND (COALESCE(s.total_stripe_sales, 0)
           - COALESCE(ROUND(COALESCE(s.total_stripe_sales, 0) * 0.036), 0)
           - 0) > 0
    ) AS eligible,
    CASE
      WHEN COALESCE(a.payouts_enabled, FALSE) = FALSE THEN 'Stripe Connectアカウントで送金が有効になっていません'
      WHEN COALESCE(s.total_stripe_sales, 0) < p_minimum_amount THEN '最小送金額の条件を満たしていません'
      WHEN (COALESCE(s.total_stripe_sales, 0)
           - COALESCE(ROUND(COALESCE(s.total_stripe_sales, 0) * 0.036), 0)
           - 0) <= 0 THEN '送金可能な金額がありません'
      ELSE NULL
    END AS ineligible_reason
  FROM unprocessed_events ue
  LEFT JOIN sales s ON s.event_id = ue.event_id
  LEFT JOIN accounts a ON a.event_id = ue.event_id
  ;
END;
$$;

COMMENT ON FUNCTION find_eligible_events_with_details(INTEGER, INTEGER, INTEGER)
  IS '送金候補イベントの詳細（売上集計、手数料、送金可否）を一括取得する。N+1を回避するためのRPC。';
