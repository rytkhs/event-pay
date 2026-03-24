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
  v_payout_status text;
  v_payouts_enabled boolean;
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
    SELECT e.payout_profile_id, pp.stripe_account_id, pp.status
      INTO v_payout_profile_id, v_stripe_account_id, v_payout_status
    FROM public.events e
    LEFT JOIN public.payout_profiles pp
      ON pp.id = e.payout_profile_id
    WHERE e.id = p_event_id;

    IF v_payout_profile_id IS NULL
       OR v_stripe_account_id IS NULL
       OR v_payout_status != 'verified' THEN
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
  uuid, character varying, character varying, public.attendance_status_enum, character varying, public.payment_method_enum, integer
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
  v_payout_status text;
  v_payouts_enabled boolean;
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
    SELECT e.payout_profile_id, pp.stripe_account_id, pp.status
      INTO v_payout_profile_id, v_stripe_account_id, v_payout_status
    FROM public.events e
    LEFT JOIN public.payout_profiles pp
      ON pp.id = e.payout_profile_id
    WHERE e.id = v_event_id;

    IF v_payout_profile_id IS NULL
       OR v_stripe_account_id IS NULL
       OR v_payout_status != 'verified' THEN
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
  uuid, text, public.attendance_status_enum, public.payment_method_enum, integer
) OWNER TO app_definer;

REVOKE CREATE ON SCHEMA public FROM app_definer;
