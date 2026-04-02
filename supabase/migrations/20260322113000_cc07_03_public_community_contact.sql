GRANT CREATE ON SCHEMA public TO app_definer;

CREATE OR REPLACE FUNCTION public.is_public_community(p_community_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM public.communities c
     WHERE c.id = p_community_id
       AND c.is_deleted = false
  );
END;
$$;

ALTER FUNCTION public.is_public_community(uuid) OWNER TO app_definer;
REVOKE ALL ON FUNCTION public.is_public_community(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_community(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_public_community(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_community(uuid) TO service_role;

COMMENT ON FUNCTION public.is_public_community(uuid) IS
  '公開問い合わせ/公開導線向けに、未削除 community かどうかを判定する';

CREATE OR REPLACE FUNCTION public.rpc_public_get_community_by_slug(p_slug text)
RETURNS TABLE(
  id uuid,
  name character varying,
  description text,
  slug character varying,
  legal_slug character varying
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.description, c.slug, c.legal_slug
    FROM public.communities c
   WHERE c.slug = p_slug
     AND c.is_deleted = false
   LIMIT 1;
END;
$$;

ALTER FUNCTION public.rpc_public_get_community_by_slug(text) OWNER TO app_definer;
REVOKE ALL ON FUNCTION public.rpc_public_get_community_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_public_get_community_by_slug(text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_public_get_community_by_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_public_get_community_by_slug(text) TO service_role;

COMMENT ON FUNCTION public.rpc_public_get_community_by_slug(text) IS
  '未削除 community の公開ページ向け最小情報を slug から取得する';

CREATE OR REPLACE FUNCTION public.rpc_public_get_community_by_legal_slug(p_legal_slug text)
RETURNS TABLE(
  id uuid,
  name character varying,
  description text,
  slug character varying,
  legal_slug character varying
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.description, c.slug, c.legal_slug
    FROM public.communities c
   WHERE c.legal_slug = p_legal_slug
     AND c.is_deleted = false
   LIMIT 1;
END;
$$;

ALTER FUNCTION public.rpc_public_get_community_by_legal_slug(text) OWNER TO app_definer;
REVOKE ALL ON FUNCTION public.rpc_public_get_community_by_legal_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_public_get_community_by_legal_slug(text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_public_get_community_by_legal_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_public_get_community_by_legal_slug(text) TO service_role;

COMMENT ON FUNCTION public.rpc_public_get_community_by_legal_slug(text) IS
  '未削除 community の公開ページ向け最小情報を legal_slug から取得する';

CREATE TABLE public.community_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  fingerprint_hash text NOT NULL,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.community_contacts IS 'コミュニティ公開ページから主催者へ届く問い合わせ';

CREATE INDEX idx_community_contacts_community_id
  ON public.community_contacts(community_id);

CREATE INDEX idx_community_contacts_created_at
  ON public.community_contacts(created_at DESC);

CREATE UNIQUE INDEX ux_community_contacts_community_fingerprint
  ON public.community_contacts(community_id, fingerprint_hash);

ALTER TABLE ONLY public.community_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.community_contacts FORCE ROW LEVEL SECURITY;

GRANT INSERT ON TABLE public.community_contacts TO anon;
GRANT SELECT, INSERT ON TABLE public.community_contacts TO authenticated;
GRANT ALL ON TABLE public.community_contacts TO service_role;

DROP POLICY IF EXISTS "Public can insert community contacts" ON public.community_contacts;
CREATE POLICY "Public can insert community contacts"
ON public.community_contacts
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_public_community(community_id));

DROP POLICY IF EXISTS "Owners can view own community contacts" ON public.community_contacts;
CREATE POLICY "Owners can view own community contacts"
ON public.community_contacts
FOR SELECT
TO authenticated
USING (public.is_community_owner(community_id));

DROP POLICY IF EXISTS "Service role can manage community contacts" ON public.community_contacts;
CREATE POLICY "Service role can manage community contacts"
ON public.community_contacts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE CREATE ON SCHEMA public FROM app_definer;
