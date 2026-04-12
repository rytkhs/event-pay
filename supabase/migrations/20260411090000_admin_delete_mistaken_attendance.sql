GRANT CREATE ON SCHEMA public TO app_definer;
GRANT DELETE ON TABLE public.payments TO app_definer;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_mistaken_attendance(
  p_event_id uuid,
  p_attendance_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_attendance public.attendances%ROWTYPE;
  v_payment_count integer := 0;
  v_deleted_payment_ids uuid[] := ARRAY[]::uuid[];
  v_blocking_payment_id uuid;
  v_jwt_claims text;
BEGIN
  v_jwt_claims := current_setting('request.jwt.claims', true);
  IF v_jwt_claims IS NULL OR v_jwt_claims = '' THEN
    RAISE EXCEPTION 'missing jwt claims'
      USING ERRCODE = 'P0001';
  END IF;

  IF ((v_jwt_claims::json->>'sub')::uuid IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match p_user_id'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_event_community_owner(p_event_id) THEN
    RAISE EXCEPTION 'Unauthorized: user is not the community owner'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_attendance
    FROM public.attendances
   WHERE id = p_attendance_id
     AND event_id = p_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found: %', p_attendance_id
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
    FROM public.payments
   WHERE attendance_id = p_attendance_id
   FOR UPDATE;

  SELECT COUNT(*), COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_payment_count, v_deleted_payment_ids
    FROM public.payments
   WHERE attendance_id = p_attendance_id;

  SELECT id
    INTO v_blocking_payment_id
    FROM public.payments
   WHERE attendance_id = p_attendance_id
     AND (
       status NOT IN ('pending', 'canceled')
       OR stripe_checkout_session_id IS NOT NULL
       OR stripe_payment_intent_id IS NOT NULL
       OR stripe_charge_id IS NOT NULL
       OR stripe_balance_transaction_id IS NOT NULL
       OR stripe_customer_id IS NOT NULL
       OR stripe_transfer_id IS NOT NULL
       OR application_fee_id IS NOT NULL
       OR application_fee_refund_id IS NOT NULL
       OR webhook_event_id IS NOT NULL
       OR webhook_processed_at IS NOT NULL
       OR checkout_idempotency_key IS NOT NULL
       OR checkout_key_revision > 0
       OR paid_at IS NOT NULL
       OR refunded_amount > 0
       OR application_fee_refunded_amount > 0
     )
   ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
   LIMIT 1;

  IF v_blocking_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment has progressed and attendance cannot be deleted: %', v_blocking_payment_id
      USING ERRCODE = 'P0003';
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
    'attendance',
    'attendance.mistaken_registration_deleted',
    'Mistaken attendance registration deleted',
    'user',
    p_user_id,
    'attendance',
    p_attendance_id::text,
    'success',
    jsonb_build_object(
      'event_id', p_event_id,
      'attendance_id', p_attendance_id,
      'attendance_status', v_attendance.status,
      'payment_count', v_payment_count,
      'deleted_payment_ids', v_deleted_payment_ids,
      'email_hash', encode(extensions.digest(convert_to(lower(v_attendance.email), 'UTF8'), 'sha256'::text), 'hex'),
      'reason', 'mistaken_registration'
    )
  );

  DELETE FROM public.attendances
   WHERE id = p_attendance_id
     AND event_id = p_event_id;

  RETURN jsonb_build_object(
    'attendance_id', p_attendance_id,
    'deleted_payment_count', v_payment_count
  );
END;
$$;

ALTER FUNCTION public.rpc_admin_delete_mistaken_attendance(uuid, uuid, uuid) OWNER TO app_definer;
REVOKE ALL ON FUNCTION public.rpc_admin_delete_mistaken_attendance(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_mistaken_attendance(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE CREATE ON SCHEMA public FROM app_definer;
