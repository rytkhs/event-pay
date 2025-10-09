-- Anonymous/Guest RPC cleanup: replace remaining direct selects with RPCs

BEGIN;

-- RPC: latest payment amount for a guest attendance
CREATE OR REPLACE FUNCTION public.rpc_guest_get_latest_payment(p_attendance_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_amount integer;
    v_token text;
BEGIN
    -- Ensure the caller (guest) owns the attendance via guest token
    v_token := public.get_guest_token();
    IF v_token IS NULL THEN
        RAISE EXCEPTION 'missing guest token';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.attendances a
        WHERE a.id = p_attendance_id AND a.guest_token = v_token
    ) THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    SELECT p.amount
      INTO v_amount
    FROM public.payments p
    WHERE p.attendance_id = p_attendance_id
    ORDER BY p.created_at DESC
    LIMIT 1;

    RETURN v_amount; -- may be null
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_guest_get_latest_payment(uuid) TO anon;

-- RPC: connect account info for event creator (public-safe)
CREATE FUNCTION public.rpc_public_get_connect_account(p_event_id uuid, p_creator_id uuid)
RETURNS TABLE (
    stripe_account_id character varying(255),
    payouts_enabled boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Validate event access for public/guest callers
    IF NOT public.can_access_event(p_event_id) THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    RETURN QUERY
    SELECT s.stripe_account_id, s.payouts_enabled
    FROM public.stripe_connect_accounts s
    JOIN public.events e ON e.created_by = s.user_id
    WHERE e.id = p_event_id
      AND e.created_by = p_creator_id
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_public_get_connect_account(uuid, uuid) TO anon;

-- Align ownership with definer role
ALTER FUNCTION public.rpc_guest_get_latest_payment(uuid) OWNER TO app_definer;
ALTER FUNCTION public.rpc_public_get_connect_account(uuid, uuid) OWNER TO app_definer;

COMMIT;
