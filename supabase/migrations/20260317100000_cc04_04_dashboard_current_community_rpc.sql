DROP FUNCTION IF EXISTS public.get_dashboard_stats();

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_community_id uuid)
RETURNS TABLE (
  upcoming_events_count integer,
  total_upcoming_participants integer,
  unpaid_fees_total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL OR p_community_id IS NULL OR NOT public.is_community_owner(p_community_id) THEN
    RETURN QUERY SELECT 0, 0, 0::bigint;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(DISTINCT e.id)::integer,
    COUNT(DISTINCT a.id)::integer,
    COALESCE(SUM(
      CASE
        WHEN a.id IS NOT NULL AND e.fee > 0 AND NOT EXISTS (
          SELECT 1 FROM public.payments p
          WHERE p.attendance_id = a.id
            AND p.status IN ('paid', 'received')
        ) THEN e.fee
        ELSE 0
      END
    ), 0)::bigint
  FROM public.events e
  LEFT JOIN public.attendances a
    ON e.id = a.event_id
   AND a.status = 'attending'
  WHERE e.community_id = p_community_id
    AND e.date > now()
    AND e.canceled_at IS NULL;
END;
$$;

ALTER FUNCTION public.get_dashboard_stats(uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO service_role;

COMMENT ON FUNCTION public.get_dashboard_stats(uuid) IS
  '現在選択中コミュニティのダッシュボード統計を取得する関数';

DROP FUNCTION IF EXISTS public.get_recent_events();

CREATE OR REPLACE FUNCTION public.get_recent_events(p_community_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  date timestamptz,
  fee integer,
  capacity integer,
  canceled_at timestamptz,
  location text,
  attendances_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL OR p_community_id IS NULL OR NOT public.is_community_owner(p_community_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title::text,
    e.date,
    e.fee,
    e.capacity,
    e.canceled_at,
    e.location::text,
    COUNT(a.id)::bigint AS attendances_count
  FROM public.events e
  LEFT JOIN public.attendances a
    ON e.id = a.event_id
   AND a.status = 'attending'
  WHERE e.community_id = p_community_id
  GROUP BY e.id
  ORDER BY e.date DESC, e.id DESC
  LIMIT 5;
END;
$$;

ALTER FUNCTION public.get_recent_events(uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.get_recent_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_events(uuid) TO service_role;

COMMENT ON FUNCTION public.get_recent_events(uuid) IS
  '現在選択中コミュニティの最近のイベント一覧を参加予定人数付きで取得する関数';
