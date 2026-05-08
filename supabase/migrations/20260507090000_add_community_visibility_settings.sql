GRANT CREATE ON SCHEMA public TO app_definer;

ALTER TABLE public.communities
  ADD COLUMN show_community_link boolean NOT NULL DEFAULT false,
  ADD COLUMN show_legal_disclosure_link boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.communities.show_community_link IS
  '招待ページ/ゲストページに主催コミュニティプロフィールへのリンクを表示するかどうか';

COMMENT ON COLUMN public.communities.show_legal_disclosure_link IS
  '招待ページ/ゲストページに特定商取引法に基づく表記へのリンクを表示するかどうか';

DROP FUNCTION IF EXISTS public.rpc_public_get_event(text);

CREATE OR REPLACE FUNCTION public.rpc_public_get_event(p_invite_token text)
RETURNS TABLE (
  id uuid,
  community_name character varying(255),
  community_slug character varying(255),
  community_legal_slug character varying(255),
  community_show_community_link boolean,
  community_show_legal_disclosure_link boolean,
  title character varying(255),
  date timestamptz,
  location character varying(500),
  description text,
  fee integer,
  capacity integer,
  payment_methods public.payment_method_enum[],
  registration_deadline timestamptz,
  payment_deadline timestamptz,
  invite_token character varying(255),
  canceled_at timestamptz,
  attendances_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    c.name AS community_name,
    c.slug AS community_slug,
    c.legal_slug AS community_legal_slug,
    c.show_community_link AS community_show_community_link,
    c.show_legal_disclosure_link AS community_show_legal_disclosure_link,
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
       WHERE a.event_id = e.id
         AND a.status = 'attending'
    ) AS attendances_count
  FROM public.events e
  JOIN public.communities c
    ON c.id = e.community_id
   AND c.is_deleted = false
  WHERE e.invite_token = p_invite_token
  LIMIT 1;
END;
$$;

ALTER FUNCTION public.rpc_public_get_event(text) OWNER TO app_definer;

COMMENT ON FUNCTION public.rpc_public_get_event(text) IS
  '招待トークンからイベント詳細を取得する公開RPC。community公開導線向け最小情報を含み、削除済みcommunityは返さない';

GRANT EXECUTE ON FUNCTION public.rpc_public_get_event(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.rpc_guest_get_attendance(text);

CREATE OR REPLACE FUNCTION public.rpc_guest_get_attendance(p_guest_token text)
RETURNS TABLE (
  attendance_id uuid,
  nickname character varying(50),
  email character varying(255),
  status public.attendance_status_enum,
  guest_token character varying(36),
  attendance_created_at timestamptz,
  attendance_updated_at timestamptz,
  event_id uuid,
  event_title character varying(255),
  event_date timestamptz,
  event_location character varying(500),
  event_fee integer,
  event_capacity integer,
  event_description text,
  event_payment_methods public.payment_method_enum[],
  event_allow_payment_after_deadline boolean,
  event_grace_period_days smallint,
  community_name character varying(255),
  community_slug character varying(255),
  community_legal_slug character varying(255),
  community_show_community_link boolean,
  community_show_legal_disclosure_link boolean,
  registration_deadline timestamptz,
  payment_deadline timestamptz,
  canceled_at timestamptz,
  payment_id uuid,
  payment_amount integer,
  payment_method public.payment_method_enum,
  payment_status public.payment_status_enum,
  payment_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := COALESCE(p_guest_token, private._get_guest_token_from_header());

  RETURN QUERY
  SELECT
    a.id,
    a.nickname,
    a.email,
    a.status,
    a.guest_token,
    a.created_at AS attendance_created_at,
    a.updated_at AS attendance_updated_at,
    e.id,
    e.title,
    e.date,
    e.location,
    e.fee,
    e.capacity,
    e.description,
    e.payment_methods,
    e.allow_payment_after_deadline,
    e.grace_period_days,
    c.name AS community_name,
    c.slug AS community_slug,
    c.legal_slug AS community_legal_slug,
    c.show_community_link AS community_show_community_link,
    c.show_legal_disclosure_link AS community_show_legal_disclosure_link,
    e.registration_deadline,
    e.payment_deadline,
    e.canceled_at,
    lp.id AS payment_id,
    lp.amount AS payment_amount,
    lp.method AS payment_method,
    lp.status AS payment_status,
    lp.created_at AS payment_created_at
  FROM public.attendances a
  JOIN public.events e
    ON e.id = a.event_id
  JOIN public.communities c
    ON c.id = e.community_id
   AND c.is_deleted = false
  LEFT JOIN LATERAL (
    SELECT p.id, p.amount, p.method, p.status, p.created_at, p.paid_at, p.updated_at
      FROM public.payments p
     WHERE p.attendance_id = a.id
     ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC, p.updated_at DESC
     LIMIT 1
  ) lp ON TRUE
  WHERE a.guest_token = v_token
  LIMIT 1;
END;
$$;

ALTER FUNCTION public.rpc_guest_get_attendance(text) OWNER TO app_definer;

COMMENT ON FUNCTION public.rpc_guest_get_attendance(text) IS
  'ゲストトークンから参加データを取得する公開RPC。community公開導線向け最小情報を含み、削除済みcommunityは返さない';

GRANT EXECUTE ON FUNCTION public.rpc_guest_get_attendance(text) TO anon, authenticated;

REVOKE CREATE ON SCHEMA public FROM app_definer;
