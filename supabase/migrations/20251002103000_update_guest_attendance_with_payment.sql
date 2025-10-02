-- Update guest attendance payment handling to align with canceled status design
BEGIN;

CREATE OR REPLACE FUNCTION "public"."update_guest_attendance_with_payment"(
  "p_attendance_id" "uuid",
  "p_status" "public"."attendance_status_enum",
  "p_payment_method" "public"."payment_method_enum" DEFAULT NULL::"public"."payment_method_enum",
  "p_event_fee" integer DEFAULT 0
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
AS $$
DECLARE
  v_event_id UUID;
  v_payment_id UUID;
  v_current_status public.attendance_status_enum;
  v_capacity INTEGER;
  v_current_attendees INTEGER;
  v_payment_status public.payment_status_enum;
  v_payment_method public.payment_method_enum;
  -- Guards (updated)
  v_canceled_at TIMESTAMPTZ;
  v_reg_deadline TIMESTAMPTZ;
  v_event_date TIMESTAMPTZ;
BEGIN
  -- 参加記録の存在確認と現在のステータス取得
  SELECT event_id, status INTO v_event_id, v_current_status
  FROM public.attendances
  WHERE id = p_attendance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found';
  END IF;

  -- イベント締切・開始・キャンセルチェック
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

  -- 定員チェック（attendingに変更する場合のみ）
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

  -- 参加ステータスを更新
  UPDATE public.attendances
  SET status = p_status
  WHERE id = p_attendance_id;

  -- 決済レコードの処理
  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
    SELECT id, status INTO v_payment_id, v_payment_status
    FROM public.payments
    WHERE attendance_id = p_attendance_id
    ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      IF v_payment_status IN ('paid', 'received', 'waived', 'refunded') THEN
        RAISE EXCEPTION 'EVP_PAYMENT_FINALIZED_IMMUTABLE: Payment is finalized; cannot modify method/amount';
      ELSIF v_payment_status = 'canceled' THEN
        -- 終端状態のレコードは新規レコードを再作成するため再利用しない
        v_payment_id := NULL;
      ELSIF v_payment_status NOT IN ('paid', 'received', 'waived', 'refunded', 'canceled') THEN
        UPDATE public.payments
        SET method = p_payment_method,
            amount = p_event_fee,
            status = 'pending'
        WHERE id = v_payment_id;
      END IF;
    END IF;

    IF v_payment_id IS NULL THEN
      INSERT INTO public.payments (
        attendance_id,
        amount,
        method,
        status
      ) VALUES (
        p_attendance_id,
        p_event_fee,
        p_payment_method,
        'pending'
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

        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'payment_canceled',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'previousStatus', v_payment_status,
            'newStatus', 'canceled',
            'attendanceStatus', p_status
          )
        );
      ELSIF v_payment_status IN ('paid', 'received') THEN
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'payment_status_maintained_on_cancel',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'paymentStatus', v_payment_status,
            'paymentMethod', v_payment_method,
            'attendanceStatus', p_status
          )
        );
      ELSIF v_payment_status = 'waived' THEN
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'waived_payment_kept',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'paymentStatus', v_payment_status,
            'attendanceStatus', p_status
          )
        );
      ELSIF v_payment_status = 'canceled' THEN
        -- 再キャンセル時は重複ログを避けるため控えめな監査ログのみ記録
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'payment_canceled_duplicate',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'paymentStatus', v_payment_status,
            'attendanceStatus', p_status
          )
        );
      ELSIF v_payment_status = 'refunded' THEN
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'refund_status_maintained_on_cancel',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'paymentStatus', v_payment_status,
            'attendanceStatus', p_status
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;

COMMIT;
