-- 主催者操作でも定員超過を許可しない
-- - 定員超過時はイベント定員を先に変更してから参加者追加/代理変更する
-- - 共通トリガーを定員制約の最終防衛線として維持する

GRANT CREATE ON SCHEMA public TO app_definer;

DROP FUNCTION IF EXISTS public.admin_add_attendance_with_capacity_check(
  uuid,
  character varying,
  character varying,
  public.attendance_status_enum,
  character varying,
  boolean
);

CREATE OR REPLACE FUNCTION public.admin_add_attendance_with_capacity_check(
  p_event_id uuid,
  p_nickname character varying,
  p_email character varying,
  p_status public.attendance_status_enum,
  p_guest_token character varying
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

  IF p_status = 'attending' AND v_capacity IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_current_count
      FROM public.attendances
     WHERE event_id = p_event_id
       AND status = 'attending';

    IF v_current_count >= v_capacity THEN
      RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_count
        USING ERRCODE = 'P0004',
              DETAIL = format('Current attendees: %s, Capacity: %s', v_current_count, v_capacity),
              HINT = 'Increase the event capacity before adding another attending participant';
    END IF;
  END IF;

  INSERT INTO public.attendances (event_id, nickname, email, status, guest_token)
  VALUES (p_event_id, p_nickname, p_email, p_status, p_guest_token)
  RETURNING id INTO v_attendance_id;

  RETURN v_attendance_id;
END;
$$;

ALTER FUNCTION public.admin_add_attendance_with_capacity_check(
  uuid,
  character varying,
  character varying,
  public.attendance_status_enum,
  character varying
) OWNER TO app_definer;

REVOKE ALL ON FUNCTION public.admin_add_attendance_with_capacity_check(
  uuid,
  character varying,
  character varying,
  public.attendance_status_enum,
  character varying
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_add_attendance_with_capacity_check(
  uuid,
  character varying,
  character varying,
  public.attendance_status_enum,
  character varying
) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_add_attendance_with_capacity_check(
  uuid,
  character varying,
  character varying,
  public.attendance_status_enum,
  character varying
) IS '主催者用参加者追加（排他ロック・定員チェック・レースコンディション対策）';

CREATE OR REPLACE FUNCTION public.check_attendance_capacity_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  event_capacity integer;
  current_attending_count integer;
BEGIN
  IF NEW.status = 'attending'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'attending') THEN
    SELECT capacity INTO event_capacity
      FROM public.events
     WHERE id = NEW.event_id
     FOR UPDATE;

    IF event_capacity IS NOT NULL THEN
      SELECT COUNT(*) INTO current_attending_count
        FROM public.attendances
       WHERE event_id = NEW.event_id
         AND status = 'attending'
         AND id IS DISTINCT FROM NEW.id;

      IF current_attending_count >= event_capacity THEN
        RAISE EXCEPTION 'このイベントは定員（%名）に達しています', event_capacity
          USING ERRCODE = 'P0004',
                DETAIL = format('Current attendees: %s, Capacity: %s', current_attending_count, event_capacity),
                HINT = 'Capacity check is enforced by attendance trigger';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.check_attendance_capacity_limit() OWNER TO app_definer;

DROP FUNCTION IF EXISTS public.rpc_admin_update_attendance_status(
  uuid,
  uuid,
  public.attendance_status_enum,
  uuid,
  public.payment_method_enum,
  boolean,
  boolean,
  boolean,
  text
);

CREATE OR REPLACE FUNCTION public.rpc_admin_update_attendance_status(
  p_event_id uuid,
  p_attendance_id uuid,
  p_new_status public.attendance_status_enum,
  p_user_id uuid,
  p_payment_method public.payment_method_enum DEFAULT NULL,
  p_acknowledged_finalized_payment boolean DEFAULT false,
  p_acknowledged_past_event boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_attendance public.attendances%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_capacity integer;
  v_current_attendees integer;
  v_has_finalized_payment boolean := false;
  v_preserved_payment public.payments%ROWTYPE;
  v_open_payment public.payments%ROWTYPE;
  v_payment_id uuid := NULL;
  v_payment_status public.payment_status_enum := NULL;
  v_payment_method public.payment_method_enum := NULL;
  v_payment_effect text := 'none';
  v_stripe_account_id character varying := NULL;
  v_payout_status public.stripe_account_status_enum := NULL;
  v_payouts_enabled boolean := false;
  v_updated_open_count integer := 0;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RAISE EXCEPTION 'missing jwt claims'
      USING ERRCODE = 'P0001';
  END IF;

  IF ((current_setting('request.jwt.claims', true)::json->>'sub')::uuid IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match p_user_id'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_event
    FROM public.events
   WHERE id = p_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event record not found: %', p_event_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_event_community_owner(v_event.id) THEN
    RAISE EXCEPTION 'Unauthorized: user is not the community owner'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_event.canceled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Event has been canceled: %', p_event_id
      USING ERRCODE = 'P0013';
  END IF;

  IF v_event.date <= now() AND NOT p_acknowledged_past_event THEN
    RAISE EXCEPTION 'Past event attendance update requires acknowledgement'
      USING ERRCODE = 'P0008';
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

  IF v_attendance.status = p_new_status THEN
    RETURN jsonb_build_object(
      'updated', false,
      'attendance_id', p_attendance_id,
      'old_status', v_attendance.status,
      'new_status', p_new_status,
      'payment_effect', 'none',
      'payment_id', NULL,
      'payment_method', NULL,
      'payment_status', NULL,
      'guest_token', v_attendance.guest_token
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.payments
     WHERE attendance_id = p_attendance_id
       AND status IN ('paid', 'received', 'waived', 'refunded')
  ) INTO v_has_finalized_payment;

  IF v_has_finalized_payment AND NOT p_acknowledged_finalized_payment THEN
    RAISE EXCEPTION 'Finalized payment exists and acknowledgement is required'
      USING ERRCODE = 'P0009';
  END IF;

  IF v_attendance.status != 'attending' AND p_new_status = 'attending' THEN
    SELECT capacity INTO v_capacity
      FROM public.events
     WHERE id = p_event_id
     FOR UPDATE;

    IF v_capacity IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_attendees
        FROM public.attendances
       WHERE event_id = p_event_id
         AND status = 'attending'
         AND id <> p_attendance_id;

      IF v_current_attendees >= v_capacity THEN
        RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_attendees
          USING ERRCODE = 'P0004',
                DETAIL = format('Current attendees: %s, Capacity: %s', v_current_attendees, v_capacity),
                HINT = 'Increase the event capacity before changing this attendance to attending';
      END IF;
    END IF;
  END IF;

  IF p_new_status = 'attending' AND v_event.fee > 0 THEN
    SELECT *
      INTO v_preserved_payment
      FROM public.payments
     WHERE attendance_id = p_attendance_id
       AND status IN ('paid', 'received', 'waived', 'refunded')
     ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      v_payment_id := v_preserved_payment.id;
      v_payment_method := v_preserved_payment.method;
      v_payment_status := v_preserved_payment.status;
      v_payment_effect := 'finalized_payment_preserved';
    ELSE
      IF p_payment_method IS NULL THEN
        RAISE EXCEPTION 'Payment method is required when changing paid event attendance to attending'
          USING ERRCODE = 'P0010';
      END IF;

      IF p_payment_method <> ALL(v_event.payment_methods) THEN
        RAISE EXCEPTION 'Payment method is not allowed for this event'
          USING ERRCODE = 'P0011';
      END IF;

      IF p_payment_method = 'stripe' THEN
        SELECT pp.stripe_account_id, pp.status, pp.payouts_enabled
          INTO v_stripe_account_id, v_payout_status, v_payouts_enabled
          FROM public.payout_profiles pp
         WHERE pp.id = v_event.payout_profile_id;

        IF v_event.payout_profile_id IS NULL
           OR v_stripe_account_id IS NULL
           OR v_payout_status != 'verified'
           OR v_payouts_enabled IS NOT TRUE THEN
          RAISE EXCEPTION 'Online payment is not available for this event'
            USING ERRCODE = 'P0012';
        END IF;
      END IF;

      SELECT *
        INTO v_open_payment
        FROM public.payments
       WHERE attendance_id = p_attendance_id
         AND status = 'pending'
         AND stripe_checkout_session_id IS NULL
         AND stripe_payment_intent_id IS NULL
         AND stripe_charge_id IS NULL
         AND stripe_balance_transaction_id IS NULL
         AND stripe_customer_id IS NULL
         AND stripe_transfer_id IS NULL
         AND application_fee_id IS NULL
         AND application_fee_refund_id IS NULL
         AND webhook_event_id IS NULL
         AND webhook_processed_at IS NULL
         AND checkout_idempotency_key IS NULL
         AND checkout_key_revision = 0
         AND paid_at IS NULL
         AND COALESCE(refunded_amount, 0) = 0
         AND COALESCE(application_fee_refunded_amount, 0) = 0
       ORDER BY created_at DESC, updated_at DESC
       LIMIT 1
       FOR UPDATE;

      IF FOUND THEN
        UPDATE public.payments
           SET method = p_payment_method,
               amount = v_event.fee,
               status = 'pending',
               paid_at = NULL,
               payout_profile_id = CASE WHEN p_payment_method = 'stripe' THEN v_event.payout_profile_id ELSE NULL END,
               stripe_account_id = CASE WHEN p_payment_method = 'stripe' THEN v_stripe_account_id ELSE NULL END,
               destination_account_id = CASE WHEN p_payment_method = 'stripe' THEN v_stripe_account_id ELSE NULL END,
               stripe_checkout_session_id = NULL,
               stripe_payment_intent_id = NULL,
               stripe_charge_id = NULL,
               stripe_balance_transaction_id = NULL,
               stripe_customer_id = NULL,
               stripe_transfer_id = NULL,
               application_fee_id = NULL,
               application_fee_refund_id = NULL,
               webhook_event_id = NULL,
               webhook_processed_at = NULL,
               checkout_idempotency_key = NULL,
               checkout_key_revision = 0,
               updated_at = now()
         WHERE id = v_open_payment.id;

        v_payment_id := v_open_payment.id;
        v_payment_method := p_payment_method;
        v_payment_status := 'pending';
        v_payment_effect := 'open_payment_reused';
      ELSE
        UPDATE public.payments
           SET status = 'canceled',
               paid_at = NULL,
               updated_at = now()
         WHERE attendance_id = p_attendance_id
           AND status = 'pending';

        INSERT INTO public.payments (
          attendance_id,
          amount,
          method,
          status,
          payout_profile_id,
          stripe_account_id,
          destination_account_id
        )
        VALUES (
          p_attendance_id,
          v_event.fee,
          p_payment_method,
          'pending',
          CASE WHEN p_payment_method = 'stripe' THEN v_event.payout_profile_id ELSE NULL END,
          CASE WHEN p_payment_method = 'stripe' THEN v_stripe_account_id ELSE NULL END,
          CASE WHEN p_payment_method = 'stripe' THEN v_stripe_account_id ELSE NULL END
        )
        RETURNING id, method, status
          INTO v_payment_id, v_payment_method, v_payment_status;

        v_payment_effect := 'payment_created';
      END IF;
    END IF;
  ELSIF p_new_status != 'attending' THEN
    UPDATE public.payments
       SET status = 'canceled',
           paid_at = NULL,
           updated_at = now()
     WHERE attendance_id = p_attendance_id
       AND status IN ('pending', 'failed');

    GET DIAGNOSTICS v_updated_open_count = ROW_COUNT;
    IF v_updated_open_count > 0 THEN
      v_payment_effect := 'open_payment_canceled';
    ELSIF v_has_finalized_payment THEN
      v_payment_effect := 'finalized_payment_preserved';
    END IF;
  END IF;

  UPDATE public.attendances
     SET status = p_new_status
   WHERE id = p_attendance_id;

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
    'attendance.admin_status_update',
    format('Admin updated attendance status from %s to %s', v_attendance.status, p_new_status),
    'user',
    p_user_id,
    'attendance',
    p_attendance_id::text,
    'success',
    jsonb_build_object(
      'event_id', p_event_id,
      'attendance_id', p_attendance_id,
      'old_status', v_attendance.status,
      'new_status', p_new_status,
      'payment_effect', v_payment_effect,
      'payment_id', v_payment_id,
      'payment_method', v_payment_method,
      'payment_status', v_payment_status,
      'acknowledged_finalized_payment', p_acknowledged_finalized_payment,
      'acknowledged_past_event', p_acknowledged_past_event,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'updated', true,
    'attendance_id', p_attendance_id,
    'old_status', v_attendance.status,
    'new_status', p_new_status,
    'payment_effect', v_payment_effect,
    'payment_id', v_payment_id,
    'payment_method', v_payment_method,
    'payment_status', v_payment_status,
    'guest_token', v_attendance.guest_token
  );
END;
$$;

ALTER FUNCTION public.rpc_admin_update_attendance_status(
  uuid,
  uuid,
  public.attendance_status_enum,
  uuid,
  public.payment_method_enum,
  boolean,
  boolean,
  text
) OWNER TO app_definer;

REVOKE ALL ON FUNCTION public.rpc_admin_update_attendance_status(
  uuid,
  uuid,
  public.attendance_status_enum,
  uuid,
  public.payment_method_enum,
  boolean,
  boolean,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_admin_update_attendance_status(
  uuid,
  uuid,
  public.attendance_status_enum,
  uuid,
  public.payment_method_enum,
  boolean,
  boolean,
  text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_admin_update_attendance_status(
  uuid,
  uuid,
  public.attendance_status_enum,
  uuid,
  public.payment_method_enum,
  boolean,
  boolean,
  text
) IS '主催者による代理出欠変更（権限確認・定員チェック・決済副作用・監査ログをDB内で実施）';

REVOKE CREATE ON SCHEMA public FROM app_definer;
