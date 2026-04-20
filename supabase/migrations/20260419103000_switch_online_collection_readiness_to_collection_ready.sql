-- オンライン集金可否判定を payout_profiles.status から collection_ready へ移行する
-- - status は表示・互換用途に残す
-- - collection_ready を Checkout / Stripe payment record 作成可否の authoritative cache とする

GRANT CREATE ON SCHEMA public TO app_definer;

CREATE OR REPLACE FUNCTION public.register_attendance_with_payment(
  p_event_id uuid,
  p_nickname character varying,
  p_email character varying,
  p_status public.attendance_status_enum,
  p_guest_token character varying,
  p_payment_method public.payment_method_enum DEFAULT NULL::public.payment_method_enum,
  p_event_fee integer DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_attendance_id uuid;
  v_payout_profile_id uuid;
  v_stripe_account_id character varying;
  v_collection_ready boolean;
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

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'Status cannot be null';
  END IF;

  IF p_guest_token IS NULL OR LENGTH(p_guest_token) != 36 THEN
    RAISE EXCEPTION 'Guest token must be exactly 36 characters long with gst_ prefix, got: %', COALESCE(LENGTH(p_guest_token), 0);
  END IF;

  IF NOT (p_guest_token ~ '^gst_[a-zA-Z0-9_-]{32}$') THEN
    RAISE EXCEPTION 'Guest token must have format gst_[32 alphanumeric chars], got: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  IF p_status = 'attending' THEN
    DECLARE
      v_capacity integer;
      v_current_attendees integer;
    BEGIN
      SELECT capacity INTO v_capacity
      FROM public.events
      WHERE id = p_event_id FOR UPDATE;

      IF v_capacity IS NULL AND NOT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id) THEN
        RAISE EXCEPTION 'Event with ID % does not exist', p_event_id;
      END IF;

      IF v_capacity IS NOT NULL THEN
        SELECT COUNT(*) INTO v_current_attendees
        FROM public.attendances
        WHERE event_id = p_event_id AND status = 'attending';

        IF v_current_attendees >= v_capacity THEN
          RAISE EXCEPTION 'このイベントは定員（%名）に達しています', v_capacity
            USING ERRCODE = 'P0001',
                  DETAIL = format('Current attendees: %s, Capacity: %s', v_current_attendees, v_capacity),
                  HINT = 'Race condition prevented by exclusive lock';
        END IF;
      END IF;
    END;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id) THEN
      RAISE EXCEPTION 'Event with ID % does not exist', p_event_id;
    END IF;
  END IF;

  IF p_event_fee IS NOT NULL AND p_event_fee < 0 THEN
    RAISE EXCEPTION 'Event fee cannot be negative, got: %', p_event_fee;
  END IF;

  IF EXISTS(SELECT 1 FROM public.attendances WHERE guest_token = p_guest_token) THEN
    RAISE EXCEPTION 'Guest token % already exists (duplicate request)', LEFT(p_guest_token, 8) || '...'
      USING ERRCODE = '23505',
            DETAIL = 'This guest token is already in use';
  END IF;

  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method = 'stripe' THEN
    SELECT e.payout_profile_id, pp.stripe_account_id, pp.collection_ready
      INTO v_payout_profile_id, v_stripe_account_id, v_collection_ready
    FROM public.events e
    LEFT JOIN public.payout_profiles pp
      ON pp.id = e.payout_profile_id
    WHERE e.id = p_event_id;

    IF v_payout_profile_id IS NULL
       OR v_stripe_account_id IS NULL
       OR v_collection_ready IS NOT TRUE THEN
      RAISE EXCEPTION 'Online payment is not available for this event';
    END IF;
  ELSE
    v_payout_profile_id := NULL;
    v_stripe_account_id := NULL;
  END IF;

  BEGIN
    INSERT INTO public.attendances (event_id, nickname, email, status, guest_token)
    VALUES (p_event_id, p_nickname, p_email, p_status, p_guest_token)
    RETURNING id INTO v_attendance_id;

    IF v_attendance_id IS NULL THEN
      RAISE EXCEPTION 'Failed to insert attendance record';
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      DECLARE
        v_constraint_name text;
      BEGIN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'attendances_event_email_unique' THEN
          RAISE EXCEPTION 'このメールアドレスは既にこのイベントに登録されています'
            USING ERRCODE = '23505',
                  DETAIL = 'attendances_event_email_unique';
        ELSIF v_constraint_name = 'attendances_guest_token_key' THEN
          RAISE EXCEPTION 'Guest token already exists (concurrent request detected): %', LEFT(p_guest_token, 8) || '...'
            USING ERRCODE = '23505',
                  DETAIL = 'This may indicate a race condition or duplicate request';
        END IF;
        RAISE;
      END;
  END;

  BEGIN
    IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
      INSERT INTO public.payments (
        attendance_id,
        amount,
        method,
        status,
        payout_profile_id,
        stripe_account_id,
        destination_account_id
      ) VALUES (
        v_attendance_id,
        p_event_fee,
        p_payment_method,
        'pending',
        v_payout_profile_id,
        v_stripe_account_id,
        v_stripe_account_id
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      DELETE FROM public.attendances WHERE id = v_attendance_id;
      RAISE;
  END;

  RETURN v_attendance_id;
END;
$$;

ALTER FUNCTION public.register_attendance_with_payment(
  uuid,
  character varying,
  character varying,
  public.attendance_status_enum,
  character varying,
  public.payment_method_enum,
  integer
) OWNER TO app_definer;

CREATE OR REPLACE FUNCTION public.update_guest_attendance_with_payment(
  p_attendance_id uuid,
  p_guest_token text,
  p_status public.attendance_status_enum,
  p_payment_method public.payment_method_enum DEFAULT NULL::public.payment_method_enum,
  p_event_fee integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_event_id uuid;
  v_payment_id uuid;
  v_current_status public.attendance_status_enum;
  v_capacity integer;
  v_current_attendees integer;
  v_payment_status public.payment_status_enum;
  v_payment_method public.payment_method_enum;
  v_canceled_at timestamptz;
  v_reg_deadline timestamptz;
  v_event_date timestamptz;
  v_payout_profile_id uuid;
  v_stripe_account_id character varying;
  v_collection_ready boolean;
BEGIN
  SELECT event_id, status INTO v_event_id, v_current_status
  FROM public.attendances
  WHERE id = p_attendance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found';
  END IF;

  IF p_guest_token IS NULL OR p_guest_token = '' THEN
    RAISE EXCEPTION 'Guest token is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attendances a
    WHERE a.id = p_attendance_id AND a.guest_token = p_guest_token
  ) THEN
    RAISE EXCEPTION 'Unauthorized: guest does not own this attendance';
  END IF;

  SELECT canceled_at, registration_deadline, date
    INTO v_canceled_at, v_reg_deadline, v_event_date
  FROM public.events
  WHERE id = v_event_id
  FOR SHARE;

  IF (v_canceled_at IS NOT NULL)
     OR (v_reg_deadline IS NOT NULL AND v_reg_deadline <= NOW())
     OR v_event_date <= NOW() THEN
    RAISE EXCEPTION 'Event is closed for modification';
  END IF;

  IF p_status = 'attending' AND v_current_status != 'attending' THEN
    SELECT capacity INTO v_capacity FROM public.events WHERE id = v_event_id FOR UPDATE;
    IF v_capacity IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_attendees
      FROM public.attendances
      WHERE event_id = v_event_id AND status = 'attending' AND id != p_attendance_id;

      IF v_current_attendees >= v_capacity THEN
        RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_attendees;
      END IF;
    END IF;
  END IF;

  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method = 'stripe' THEN
    SELECT e.payout_profile_id, pp.stripe_account_id, pp.collection_ready
      INTO v_payout_profile_id, v_stripe_account_id, v_collection_ready
    FROM public.events e
    LEFT JOIN public.payout_profiles pp
      ON pp.id = e.payout_profile_id
    WHERE e.id = v_event_id;

    IF v_payout_profile_id IS NULL
       OR v_stripe_account_id IS NULL
       OR v_collection_ready IS NOT TRUE THEN
      RAISE EXCEPTION 'Online payment is not available for this event';
    END IF;
  ELSE
    v_payout_profile_id := NULL;
    v_stripe_account_id := NULL;
  END IF;

  UPDATE public.attendances
  SET status = p_status
  WHERE id = p_attendance_id;

  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
    SELECT id, status, method INTO v_payment_id, v_payment_status, v_payment_method
    FROM public.payments
    WHERE attendance_id = p_attendance_id
    ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      IF v_payment_status IN ('paid', 'received', 'waived') THEN
        NULL;
      ELSIF v_payment_status = 'refunded' THEN
        v_payment_id := NULL;
      ELSIF v_payment_status = 'canceled' THEN
        v_payment_id := NULL;
      ELSIF v_payment_status NOT IN ('paid', 'received', 'waived', 'refunded', 'canceled') THEN
        UPDATE public.payments
        SET method = p_payment_method,
            amount = p_event_fee,
            status = 'pending',
            payout_profile_id = v_payout_profile_id,
            stripe_account_id = v_stripe_account_id,
            destination_account_id = v_stripe_account_id,
            stripe_checkout_session_id = NULL,
            stripe_payment_intent_id = NULL,
            checkout_idempotency_key = NULL,
            checkout_key_revision = 0
        WHERE id = v_payment_id;
      END IF;
    END IF;

    IF v_payment_id IS NULL THEN
      INSERT INTO public.payments (
        attendance_id,
        amount,
        method,
        status,
        payout_profile_id,
        stripe_account_id,
        destination_account_id
      ) VALUES (
        p_attendance_id,
        p_event_fee,
        p_payment_method,
        'pending',
        v_payout_profile_id,
        v_stripe_account_id,
        v_stripe_account_id
      );
    END IF;
  ELSIF p_status != 'attending' THEN
    SELECT id, status, method INTO v_payment_id, v_payment_status, v_payment_method
    FROM public.payments
    WHERE attendance_id = p_attendance_id
    ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_payment_status IN ('pending', 'failed') THEN
        UPDATE public.payments
        SET status = 'canceled',
            paid_at = NULL,
            updated_at = now()
        WHERE id = v_payment_id
          AND status IN ('pending', 'failed');

        INSERT INTO public.system_logs (
          log_category, action, message, actor_type, resource_type, resource_id, outcome, metadata
        ) VALUES (
          'payment',
          'payment.canceled',
          'Payment canceled due to attendance status change',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'previous_status', v_payment_status,
            'new_status', 'canceled',
            'attendance_status', p_status
          )
        );
      ELSIF v_payment_status IN ('paid', 'received') THEN
        INSERT INTO public.system_logs (
          log_category, action, message, actor_type, resource_type, resource_id, outcome, metadata
        ) VALUES (
          'payment',
          'payment.status_maintained_on_cancel',
          'Payment status maintained on attendance cancel',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'payment_status', v_payment_status,
            'payment_method', v_payment_method,
            'attendance_status', p_status
          )
        );
      END IF;
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION public.update_guest_attendance_with_payment(
  uuid,
  text,
  public.attendance_status_enum,
  public.payment_method_enum,
  integer
) OWNER TO app_definer;

DROP FUNCTION IF EXISTS public.rpc_public_get_connect_account(uuid);

CREATE OR REPLACE FUNCTION public.rpc_public_get_connect_account(p_event_id uuid)
RETURNS TABLE(
  payout_profile_id uuid,
  stripe_account_id character varying,
  status text,
  collection_ready boolean
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
    pp.status::text,
    pp.collection_ready
  FROM public.events e
  JOIN public.payout_profiles pp
    ON pp.id = e.payout_profile_id
  WHERE e.id = p_event_id
  LIMIT 1;
END;
$$;

ALTER FUNCTION public.rpc_public_get_connect_account(uuid) OWNER TO app_definer;
GRANT EXECUTE ON FUNCTION public.rpc_public_get_connect_account(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.rpc_public_get_connect_account(uuid) IS
  '公開/ゲスト決済前段向けに、対象イベントの payout_profile から checkout に必要な最小 Connect 情報を取得する';

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
  v_collection_ready boolean := false;
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
        SELECT pp.stripe_account_id, pp.collection_ready
          INTO v_stripe_account_id, v_collection_ready
          FROM public.payout_profiles pp
         WHERE pp.id = v_event.payout_profile_id;

        IF v_event.payout_profile_id IS NULL
           OR v_stripe_account_id IS NULL
           OR v_collection_ready IS NOT TRUE THEN
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
