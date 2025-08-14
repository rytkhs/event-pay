-- ====================================================================
-- find_eligible_events_basic
--   イベント単位で送金候補を検索する軽量 RPC
--   ・重複行を根絶 (DISTINCT / GROUP BY)
--   ・売上合計のみ計算 (手数料などはアプリ側)
-- ====================================================================

CREATE OR REPLACE FUNCTION find_eligible_events_basic(
  p_days_after_event INTEGER DEFAULT 5,
  p_minimum_amount INTEGER DEFAULT 100,
  p_limit INTEGER DEFAULT 50,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  title TEXT,
  event_date DATE,
  fee INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ,
  paid_attendances_count INTEGER,
  total_stripe_sales INTEGER
)
LANGUAGE sql STABLE AS $$
  WITH candidate AS (
    SELECT e.id           AS event_id,
           e.title        AS title,
           e.date         AS event_date,
           e.fee          AS fee,
           e.created_by   AS created_by,
           e.created_at   AS created_at
    FROM public.events e
    WHERE e.status = 'past'
      AND e.date <= (CURRENT_DATE - (p_days_after_event || ' days')::INTERVAL)::DATE
      AND (p_user_id IS NULL OR e.created_by = p_user_id)
    ORDER BY e.date ASC
    LIMIT p_limit
  ),
  sales AS (
    SELECT c.event_id,
           COUNT(p.id) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid') AS paid_attendances_count,
           COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid'), 0)       AS total_stripe_sales
    FROM candidate c
    LEFT JOIN public.attendances a ON a.event_id = c.event_id
    LEFT JOIN public.payments    p ON p.attendance_id = a.id
    GROUP BY c.event_id
  )
  SELECT c.event_id,
         c.title,
         c.event_date,
         c.fee,
         c.created_by,
         c.created_at,
         COALESCE(s.paid_attendances_count, 0) AS paid_attendances_count,
         COALESCE(s.total_stripe_sales, 0)      AS total_stripe_sales
  FROM candidate c
  LEFT JOIN sales s ON s.event_id = c.event_id
  WHERE COALESCE(s.total_stripe_sales, 0) >= p_minimum_amount;
$$;

COMMENT ON FUNCTION find_eligible_events_basic IS 'イベント単位で送金候補を返す軽量 RPC (重複排除済み)';
