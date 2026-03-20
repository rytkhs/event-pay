GRANT SELECT ON TABLE public.communities TO app_definer;
GRANT SELECT ON TABLE public.payout_profiles TO app_definer;
GRANT CREATE ON SCHEMA public TO app_definer;

REVOKE ALL ON TABLE public.communities FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.communities TO authenticated;
GRANT ALL ON TABLE public.communities TO service_role;

REVOKE ALL ON TABLE public.payout_profiles FROM authenticated;
GRANT SELECT ON TABLE public.payout_profiles TO authenticated;
GRANT ALL ON TABLE public.payout_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.is_community_owner(p_community_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  BEGIN
    v_current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_current_user_id := NULL;
  END;

  IF v_current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.communities c
    WHERE c.id = p_community_id
      AND c.created_by = v_current_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_payout_profile_owner(p_payout_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  BEGIN
    v_current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_current_user_id := NULL;
  END;

  IF v_current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.payout_profiles pp
    WHERE pp.id = p_payout_profile_id
      AND pp.owner_user_id = v_current_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_event_community_owner(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  BEGIN
    v_current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_current_user_id := NULL;
  END;

  IF v_current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.communities c ON c.id = e.community_id
    WHERE e.id = p_event_id
      AND c.created_by = v_current_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_attendance_community_owner(p_attendance_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  BEGIN
    v_current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_current_user_id := NULL;
  END;

  IF v_current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.attendances a
    JOIN public.events e ON e.id = a.event_id
    JOIN public.communities c ON c.id = e.community_id
    WHERE a.id = p_attendance_id
      AND c.created_by = v_current_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_payment_community_owner(p_payment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  BEGIN
    v_current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_current_user_id := NULL;
  END;

  IF v_current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.payments p
    JOIN public.attendances a ON a.id = p.attendance_id
    JOIN public.events e ON e.id = a.event_id
    JOIN public.communities c ON c.id = e.community_id
    WHERE p.id = p_payment_id
      AND c.created_by = v_current_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_community_mvp_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_owner_user_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'communities.created_by is immutable';
    END IF;

    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'communities.slug is immutable';
    END IF;
  END IF;

  IF NEW.current_payout_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pp.owner_user_id
    INTO v_owner_user_id
    FROM public.payout_profiles pp
   WHERE pp.id = NEW.current_payout_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_payout_profile_id % does not exist', NEW.current_payout_profile_id;
  END IF;

  IF v_owner_user_id IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'current_payout_profile_id must belong to the community owner';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_payout_profile_mvp_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_community_owner uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'payout_profiles.owner_user_id is immutable';
  END IF;

  IF NEW.representative_community_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.created_by
    INTO v_community_owner
    FROM public.communities c
   WHERE c.id = NEW.representative_community_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'representative_community_id % does not exist',
      NEW.representative_community_id;
  END IF;

  IF v_community_owner IS DISTINCT FROM NEW.owner_user_id THEN
    RAISE EXCEPTION 'representative_community_id must belong to the payout profile owner';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_event_mvp_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'events.created_by is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_event(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  guest_token_var text;
BEGIN
  IF public.is_event_community_owner(p_event_id) THEN
    RETURN TRUE;
  END IF;

  BEGIN
    guest_token_var := private._get_guest_token_from_header();
  EXCEPTION WHEN OTHERS THEN
    guest_token_var := NULL;
  END;

  IF guest_token_var IS NOT NULL AND guest_token_var != '' THEN
    IF EXISTS (
      SELECT 1
      FROM public.attendances a
      WHERE a.event_id = p_event_id
        AND a.guest_token = guest_token_var
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_invite_links(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.is_event_community_owner(p_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_attendance_with_capacity_check(
  p_event_id uuid,
  p_nickname character varying,
  p_email character varying,
  p_status public.attendance_status_enum,
  p_guest_token character varying,
  p_bypass_capacity boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_attendance_id uuid;
  v_capacity integer;
  v_current_count integer;
  v_current_user_id uuid;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event ID cannot be null';
  END IF;

  IF p_nickname IS NULL OR LENGTH(TRIM(p_nickname)) = 0 THEN
    RAISE EXCEPTION 'Nickname cannot be null or empty';
  END IF;

  IF p_email IS NULL OR LENGTH(TRIM(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email cannot be null or empty';
  END IF;

  IF p_guest_token IS NULL OR LENGTH(TRIM(p_guest_token)) = 0 THEN
    RAISE EXCEPTION 'Guest token cannot be null or empty';
  END IF;

  BEGIN
    v_current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_current_user_id := NULL;
  END;

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT capacity
    INTO v_capacity
    FROM public.events
   WHERE id = p_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;

  IF NOT public.is_event_community_owner(p_event_id) THEN
    RAISE EXCEPTION 'Only community owner can add participants' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.attendances WHERE guest_token = p_guest_token) THEN
    RAISE EXCEPTION 'Guest token already exists: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  IF p_status = 'attending' AND v_capacity IS NOT NULL AND NOT p_bypass_capacity THEN
    SELECT COUNT(*)
      INTO v_current_count
      FROM public.attendances
     WHERE event_id = p_event_id
       AND status = 'attending';

    IF v_current_count >= v_capacity THEN
      RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_count
        USING ERRCODE = 'P0001',
              DETAIL = format('Current: %s, Capacity: %s, Bypass: %s', v_current_count, v_capacity, p_bypass_capacity),
              HINT = 'Set bypass_capacity=true to override capacity limit';
    END IF;
  END IF;

  INSERT INTO public.attendances (event_id, nickname, email, status, guest_token)
  VALUES (p_event_id, p_nickname, p_email, p_status, p_guest_token)
  RETURNING id INTO v_attendance_id;

  RETURN v_attendance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_update_payment_status_safe(
  p_payment_id uuid,
  p_new_status public.payment_status_enum,
  p_expected_version integer,
  p_user_id uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_updated_rows integer;
  v_payment_record payments%ROWTYPE;
  v_attendance_record attendances%ROWTYPE;
  v_event_record events%ROWTYPE;
  v_result json;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RAISE EXCEPTION 'missing jwt claims';
  END IF;

  IF ((current_setting('request.jwt.claims', true)::json->>'sub')::uuid IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match p_user_id' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_payment_record
    FROM public.payments
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found: %', p_payment_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_attendance_record
    FROM public.attendances
   WHERE id = v_payment_record.attendance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found: %', v_payment_record.attendance_id
      USING ERRCODE = 'P0005';
  END IF;

  SELECT *
    INTO v_event_record
    FROM public.events
   WHERE id = v_attendance_record.event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event record not found: %', v_attendance_record.event_id
      USING ERRCODE = 'P0006';
  END IF;

  IF NOT public.is_event_community_owner(v_event_record.id) THEN
    RAISE EXCEPTION 'Unauthorized: User % is not the community owner', p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_payment_record.method != 'cash' THEN
    RAISE EXCEPTION 'Only cash payments can be manually updated'
      USING ERRCODE = 'P0003';
  END IF;

  IF p_new_status = 'pending' AND v_payment_record.status IN ('received', 'waived') THEN
    PERFORM set_config('app.internal_rpc_bypass_c8f2a1b3', 'true', true);
  END IF;

  UPDATE public.payments
     SET status = p_new_status,
         paid_at = CASE
           WHEN p_new_status = 'received' THEN now()
           WHEN p_new_status = 'waived' THEN paid_at
           WHEN p_new_status = 'pending' THEN NULL
           ELSE paid_at
         END,
         version = version + 1
   WHERE id = p_payment_id
     AND version = p_expected_version
     AND method = 'cash';

  IF p_new_status = 'pending' THEN
    PERFORM set_config('app.internal_rpc_bypass_c8f2a1b3', 'false', true);
  END IF;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Concurrent update detected for payment %', p_payment_id
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.system_logs (
    log_category,
    action,
    message,
    actor_type,
    user_id,
    resource_type,
    resource_id,
    outcome,
    metadata
  )
  VALUES (
    'payment',
    'payment.status_update',
    format('Payment status updated from %s to %s', v_payment_record.status, p_new_status),
    'user',
    p_user_id,
    'payment',
    p_payment_id::text,
    'success',
    jsonb_build_object(
      'old_status', v_payment_record.status,
      'new_status', p_new_status,
      'expected_version', p_expected_version,
      'new_version', v_payment_record.version + 1,
      'notes', p_notes,
      'event_id', v_event_record.id,
      'attendance_id', v_attendance_record.id
    )
  );

  v_result := jsonb_build_object(
    'payment_id', p_payment_id,
    'status', p_new_status,
    'new_version', v_payment_record.version + 1,
    'updated_at', now()
  );

  RETURN v_result;
END;
$$;

DROP POLICY IF EXISTS "Creators can delete own events" ON public.events;
CREATE POLICY "Creators can delete own events"
ON public.events
FOR DELETE
TO authenticated
USING (public.is_event_community_owner(id));

DROP POLICY IF EXISTS "Creators can insert own events" ON public.events;
CREATE POLICY "Creators can insert own events"
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_community_owner(community_id)
  AND (SELECT auth.uid()) = created_by
);

DROP POLICY IF EXISTS "Creators can update own events" ON public.events;
CREATE POLICY "Creators can update own events"
ON public.events
FOR UPDATE
TO authenticated
USING (public.is_event_community_owner(id))
WITH CHECK (public.is_community_owner(community_id));

DROP POLICY IF EXISTS "Event access policy" ON public.events;
CREATE POLICY "Event access policy"
ON public.events
FOR SELECT
TO authenticated, anon
USING (public.can_access_event(id));

CREATE POLICY "Owners can view own communities"
ON public.communities
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) = created_by
  OR public.is_community_owner(id)
);

CREATE POLICY "Owners can insert own communities"
ON public.communities
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = created_by);

CREATE POLICY "Owners can update own communities"
ON public.communities
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.uid()) = created_by
  OR public.is_community_owner(id)
)
WITH CHECK ((SELECT auth.uid()) = created_by);

CREATE POLICY "Service role can manage communities"
ON public.communities
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Owners can view own payout profiles"
ON public.payout_profiles
FOR SELECT
TO authenticated
USING (public.is_payout_profile_owner(id));

CREATE POLICY "Service role can manage payout profiles"
ON public.payout_profiles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "dispute_select_event_owner" ON public.payment_disputes;
CREATE POLICY "dispute_select_event_owner"
ON public.payment_disputes
FOR SELECT
TO authenticated
USING (public.is_payment_community_owner(payment_id));

DROP POLICY IF EXISTS "event_creators_can_insert_attendances" ON public.attendances;
CREATE POLICY "event_creators_can_insert_attendances"
ON public.attendances
FOR INSERT
TO authenticated
WITH CHECK (public.is_event_community_owner(event_id));

DROP POLICY IF EXISTS "event_creators_can_insert_payments" ON public.payments;
CREATE POLICY "event_creators_can_insert_payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (public.is_attendance_community_owner(attendance_id));

DROP POLICY IF EXISTS "event_creators_can_update_attendances" ON public.attendances;
CREATE POLICY "event_creators_can_update_attendances"
ON public.attendances
FOR UPDATE
TO authenticated
USING (public.is_attendance_community_owner(id))
WITH CHECK (public.is_event_community_owner(event_id));

DROP POLICY IF EXISTS "event_creators_can_view_attendances" ON public.attendances;
CREATE POLICY "event_creators_can_view_attendances"
ON public.attendances
FOR SELECT
TO authenticated
USING (public.is_attendance_community_owner(id));

DROP POLICY IF EXISTS "event_creators_can_view_payments" ON public.payments;
CREATE POLICY "event_creators_can_view_payments"
ON public.payments
FOR SELECT
TO authenticated
USING (public.is_payment_community_owner(id));

DROP TRIGGER IF EXISTS trg_enforce_community_mvp_invariants ON public.communities;
CREATE TRIGGER trg_enforce_community_mvp_invariants
BEFORE INSERT OR UPDATE ON public.communities
FOR EACH ROW
EXECUTE FUNCTION public.enforce_community_mvp_invariants();

DROP TRIGGER IF EXISTS trg_enforce_payout_profile_mvp_invariants ON public.payout_profiles;
CREATE TRIGGER trg_enforce_payout_profile_mvp_invariants
BEFORE INSERT OR UPDATE ON public.payout_profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_payout_profile_mvp_invariants();

DROP TRIGGER IF EXISTS trg_enforce_event_mvp_invariants ON public.events;
CREATE TRIGGER trg_enforce_event_mvp_invariants
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.enforce_event_mvp_invariants();

GRANT EXECUTE ON FUNCTION public.is_community_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_payout_profile_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_event_community_owner(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_attendance_community_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_payment_community_owner(uuid) TO authenticated, service_role;

ALTER FUNCTION public.is_community_owner(uuid) OWNER TO app_definer;
ALTER FUNCTION public.is_payout_profile_owner(uuid) OWNER TO app_definer;
ALTER FUNCTION public.is_event_community_owner(uuid) OWNER TO app_definer;
ALTER FUNCTION public.is_attendance_community_owner(uuid) OWNER TO app_definer;
ALTER FUNCTION public.is_payment_community_owner(uuid) OWNER TO app_definer;
ALTER FUNCTION public.enforce_community_mvp_invariants() OWNER TO app_definer;
ALTER FUNCTION public.enforce_payout_profile_mvp_invariants() OWNER TO app_definer;
ALTER FUNCTION public.enforce_event_mvp_invariants() OWNER TO app_definer;
ALTER FUNCTION public.can_access_event(uuid) OWNER TO app_definer;
ALTER FUNCTION public.can_manage_invite_links(uuid) OWNER TO app_definer;
ALTER FUNCTION public.admin_add_attendance_with_capacity_check(
  uuid,
  character varying,
  character varying,
  public.attendance_status_enum,
  character varying,
  boolean
) OWNER TO app_definer;
ALTER FUNCTION public.rpc_update_payment_status_safe(
  uuid,
  public.payment_status_enum,
  integer,
  uuid,
  text
) OWNER TO app_definer;
REVOKE CREATE ON SCHEMA public FROM app_definer;
