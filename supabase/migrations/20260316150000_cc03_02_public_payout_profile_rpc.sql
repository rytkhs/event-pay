DROP FUNCTION IF EXISTS public.rpc_public_get_connect_account(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_public_get_connect_account(p_event_id uuid)
RETURNS TABLE(
  payout_profile_id uuid,
  stripe_account_id character varying,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.can_access_event(p_event_id) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  RETURN QUERY
  SELECT
    pp.id,
    pp.stripe_account_id,
    pp.status::text
  FROM public.events e
  JOIN public.payout_profiles pp
    ON pp.id = e.payout_profile_id
  WHERE e.id = p_event_id
  LIMIT 1;
END;
$$;

GRANT CREATE ON SCHEMA public TO app_definer;
ALTER FUNCTION public.rpc_public_get_connect_account(uuid) OWNER TO app_definer;

GRANT EXECUTE ON FUNCTION public.rpc_public_get_connect_account(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.rpc_public_get_connect_account(uuid) IS
  '公開/ゲスト決済前段向けに、対象イベントの payout_profile から checkout に必要な最小 Connect 情報を取得する';

REVOKE CREATE ON SCHEMA public FROM app_definer;
