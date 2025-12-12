-- ダッシュボード統計用のRPC関数

CREATE OR REPLACE FUNCTION get_dashboard_stats()
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

  -- 未ログイン時はゼロを返す
  IF v_user_id IS NULL THEN
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
          SELECT 1 FROM payments p
          WHERE p.attendance_id = a.id
          AND p.status IN ('paid', 'received')
        ) THEN e.fee
        ELSE 0
      END
    ), 0)::bigint
  FROM events e
  LEFT JOIN attendances a ON e.id = a.event_id AND a.status = 'attending'
  WHERE e.created_by = v_user_id
    AND e.date > now()
    AND e.canceled_at IS NULL;
END;
$$;

ALTER FUNCTION "public"."get_dashboard_stats"() OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_dashboard_stats"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_dashboard_stats"() TO "service_role";

COMMENT ON FUNCTION "public"."get_dashboard_stats"() IS 'ユーザーのダッシュボード統計を取得する関数';
