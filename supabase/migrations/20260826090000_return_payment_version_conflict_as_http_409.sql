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
      USING ERRCODE = 'PT409';
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
