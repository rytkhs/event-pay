-- ダッシュボード最近のイベント取得用のRPC関数

CREATE OR REPLACE FUNCTION get_recent_events()
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
  SELECT
    e.id,
    e.title,
    e.date,
    e.fee,
    e.capacity,
    e.canceled_at,
    e.location,
    COUNT(a.id)::bigint AS attendances_count
  FROM events e
  LEFT JOIN attendances a
    ON e.id = a.event_id
   AND a.status = 'attending'
  WHERE e.created_by = auth.uid()
  GROUP BY e.id
  ORDER BY e.date DESC, e.id DESC
  LIMIT 5;
$$;

ALTER FUNCTION "public"."get_recent_events"() OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_recent_events"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_recent_events"() TO "service_role";

COMMENT ON FUNCTION "public"."get_recent_events"() IS 'ユーザーの最近のイベント一覧を参加予定人数付きで取得する関数';
