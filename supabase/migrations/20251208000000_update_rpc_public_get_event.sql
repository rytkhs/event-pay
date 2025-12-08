-- rpc_public_get_event の更新
-- 変更点:
-- 1. usersテーブルと結合し、organizer_name (作成者名) を取得
-- 2. 特商法リンク用に created_by を取得
-- 3. アプリ側での詳細なエラー表示のため、日付やキャンセルステータスでのフィルタリングを削除
-- 4. 戻り値の型定義を更新
GRANT CREATE ON SCHEMA public TO app_definer;

DROP FUNCTION IF EXISTS "public"."rpc_public_get_event"(text);

CREATE OR REPLACE FUNCTION "public"."rpc_public_get_event"("p_invite_token" text)
RETURNS TABLE (
  "id" uuid,
  "created_by" uuid,
  "organizer_name" character varying(255),
  "title" character varying(255),
  "date" timestamptz,
  "location" character varying(500),
  "description" text,
  "fee" integer,
  "capacity" integer,
  "payment_methods" "public"."payment_method_enum"[],
  "registration_deadline" timestamptz,
  "payment_deadline" timestamptz,
  "invite_token" character varying(255),
  "canceled_at" timestamptz,
  "attendances_count" integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.created_by,
        COALESCE(u.name, '主催者') as organizer_name,
        e.title,
        e.date,
        e.location,
        e.description,
        e.fee,
        e.capacity,
        e.payment_methods,
        e.registration_deadline,
        e.payment_deadline,
        e.invite_token,
        e.canceled_at,
        (
          SELECT COUNT(*)::int
          FROM public.attendances a
          WHERE a.event_id = e.id AND a.status = 'attending'
        ) AS attendances_count
    FROM public.events e
    LEFT JOIN public.users u ON e.created_by = u.id
    WHERE e.invite_token = p_invite_token;
END;
$$;

ALTER FUNCTION "public"."rpc_public_get_event"("p_invite_token" text) OWNER TO "app_definer";

COMMENT ON FUNCTION "public"."rpc_public_get_event"("p_invite_token" text) IS '招待トークンからイベント詳細を取得(公開RPC、主催者名・ID含む、ステータスフィルタなし)';

GRANT EXECUTE ON FUNCTION "public"."rpc_public_get_event"(text) TO "anon", "authenticated";

REVOKE CREATE ON SCHEMA public FROM app_definer;
