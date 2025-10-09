-- DB Hardening: anon minimization, FORCE RLS, function context prep, and public RPCs
-- Plan: 1.a (remove anon table grants, use RPC/views) + 2.a (prep for app_definer)

BEGIN;

-- 1) Create dedicated definer role (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_definer') THEN
        CREATE ROLE app_definer NOLOGIN;
    END IF;
END
$$;

-- Allow postgres to SET ROLE to app_definer for ownership transfer
GRANT app_definer TO postgres;

GRANT USAGE, CREATE ON SCHEMA public TO app_definer;

-- Grant minimal object privileges required for SECURITY DEFINER functions
GRANT SELECT ON TABLE public.events TO app_definer;
GRANT SELECT, INSERT, UPDATE ON TABLE public.attendances TO app_definer;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payments TO app_definer;
GRANT SELECT, INSERT, UPDATE ON TABLE public.settlements TO app_definer;
GRANT SELECT ON TABLE public.public_profiles TO app_definer;
GRANT SELECT ON TABLE public.fee_config TO app_definer;
GRANT SELECT ON TABLE public.stripe_connect_accounts TO app_definer;
GRANT SELECT ON TABLE public.payment_disputes TO app_definer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_definer;

-- 2) Enforce RLS on sensitive tables (superuser still bypasses; functions owned by postgres unaffected)
-- Note: public_profiles is a VIEW, not a table, so FORCE RLS is not applicable
ALTER TABLE public.events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settlements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_connect_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_config FORCE ROW LEVEL SECURITY;

-- 3) Revoke direct anon access to tables/sequences (migrating to RPC/view model)
REVOKE ALL ON TABLE public.events FROM anon;
REVOKE ALL ON TABLE public.attendances FROM anon;
REVOKE ALL ON TABLE public.payments FROM anon;
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.public_profiles FROM anon;
REVOKE ALL ON TABLE public.settlements FROM anon;
REVOKE ALL ON TABLE public.stripe_connect_accounts FROM anon;
REVOKE ALL ON TABLE public.fee_config FROM anon;

-- tighten future defaults as well (functions already handled in initial schema)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- 4) Public-safe RPCs for anonymous access

-- 4-1) Public event fetch via invite token with minimal columns + attending count
CREATE OR REPLACE FUNCTION public.rpc_public_get_event(p_invite_token text)
RETURNS TABLE (
    id uuid,
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
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
    WHERE e.invite_token = p_invite_token
      AND public.can_access_event(e.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_public_get_event(text) TO anon;

-- 4-2) Public attending count by event id (for capacity checks)
CREATE OR REPLACE FUNCTION public.rpc_public_attending_count(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    IF NOT public.can_access_event(p_event_id) THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    SELECT COUNT(*)::int INTO v_count
    FROM public.attendances a
    WHERE a.event_id = p_event_id
      AND a.status = 'attending';

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_public_attending_count(uuid) TO anon;

-- 4-3) Guest attendance fetch via X-Guest-Token header
CREATE OR REPLACE FUNCTION public.rpc_guest_get_attendance()
RETURNS TABLE (
    attendance_id uuid,
    nickname character varying(50),
    email character varying(255),
    status public.attendance_status_enum,
    guest_token character varying(36),
    event_id uuid,
    event_title character varying(255),
    event_date timestamptz,
    event_fee integer,
    created_by uuid,
    registration_deadline timestamptz,
    payment_deadline timestamptz,
    canceled_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.nickname,
        a.email,
        a.status,
        a.guest_token,
        e.id,
        e.title,
        e.date,
        e.fee,
        e.created_by,
        e.registration_deadline,
        e.payment_deadline,
        e.canceled_at
    FROM public.attendances a
    JOIN public.events e ON e.id = a.event_id
    WHERE a.guest_token = public.get_guest_token()
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_guest_get_attendance() TO anon;

-- 5) Helpful indexes for settlement/attendance lookups
-- Note: payments table uses attendance_id not event_id
CREATE INDEX IF NOT EXISTS idx_payments_attendance_status
  ON public.payments (attendance_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_payments_status_paid
  ON public.payments (status, paid_at) WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_attendances_event_guest
  ON public.attendances (event_id, guest_token);

CREATE INDEX IF NOT EXISTS idx_attendances_event_status
  ON public.attendances (event_id, status);

CREATE INDEX IF NOT EXISTS idx_settlements_event_created
  ON public.settlements (event_id, created_at);

-- 6) Public duplicate email check RPC (for anon capacity/dup checks)
CREATE OR REPLACE FUNCTION public.rpc_public_check_duplicate_email(p_event_id uuid, p_email text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_exists boolean := false;
BEGIN
    IF NOT public.can_access_event(p_event_id) THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.attendances a
        WHERE a.event_id = p_event_id
          AND a.email = p_email
    ) INTO v_exists;

    RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_public_check_duplicate_email(uuid, text) TO anon;

-- 7) Function security context adjustments
-- Convert read-only helpers to SECURITY INVOKER (enforce caller RLS)
ALTER FUNCTION public.get_min_payout_amount() SECURITY INVOKER;
ALTER FUNCTION public.status_rank(public.payment_status_enum) SECURITY INVOKER;
ALTER FUNCTION public.get_event_creator_name(uuid) SECURITY INVOKER;

-- Transfer SECURITY DEFINER ownership to app_definer to avoid superuser context
ALTER FUNCTION public.generate_settlement_report(uuid, uuid) OWNER TO app_definer;
ALTER FUNCTION public.register_attendance_with_payment(uuid, character varying, character varying, public.attendance_status_enum, character varying, public.payment_method_enum, integer) OWNER TO app_definer;
ALTER FUNCTION public.update_guest_attendance_with_payment(uuid, public.attendance_status_enum, public.payment_method_enum, integer) OWNER TO app_definer;
ALTER FUNCTION public.rpc_update_payment_status_safe(uuid, public.payment_status_enum, integer, uuid, text) OWNER TO app_definer;
ALTER FUNCTION public.rpc_bulk_update_payment_status_safe(jsonb, uuid, text) OWNER TO app_definer;
ALTER FUNCTION public.get_settlement_report_details(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer, integer) OWNER TO app_definer;
ALTER FUNCTION public.can_access_event(uuid) OWNER TO app_definer;
ALTER FUNCTION public.can_access_attendance(uuid) OWNER TO app_definer;
ALTER FUNCTION public.can_manage_invite_links(uuid) OWNER TO app_definer;
ALTER FUNCTION public.check_attendance_capacity_limit() OWNER TO app_definer;

-- Transfer new public RPCs ownership to app_definer as well
ALTER FUNCTION public.rpc_public_get_event(text) OWNER TO app_definer;
ALTER FUNCTION public.rpc_public_attending_count(uuid) OWNER TO app_definer;
ALTER FUNCTION public.rpc_guest_get_attendance() OWNER TO app_definer;
ALTER FUNCTION public.rpc_public_check_duplicate_email(uuid, text) OWNER TO app_definer;

COMMIT;
