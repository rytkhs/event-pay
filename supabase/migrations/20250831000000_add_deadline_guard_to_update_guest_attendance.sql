-- Add deadline / event status guard to update_guest_attendance_with_payment
-- NOTE: Timestamp in filename ensures correct order; adjust if conflict.

-- Redefine function with additional validation at top
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.update_guest_attendance_with_payment(
    p_attendance_id UUID,
    p_status public.attendance_status_enum,
    p_payment_method public.payment_method_enum DEFAULT NULL,
    p_event_fee INTEGER DEFAULT 0
  )
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $function$
  DECLARE
    v_event_id UUID;
    v_payment_id UUID;
    v_current_status public.attendance_status_enum;
    v_capacity INTEGER;
    v_current_attendees INTEGER;
    v_payment_status public.payment_status_enum;
    v_payment_method public.payment_method_enum;
    -- Added guards
    v_event_status public.event_status_enum;
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

    -- イベント締切・開始・ステータスチェック (追加)
    SELECT status, registration_deadline, date
      INTO v_event_status, v_reg_deadline, v_event_date
    FROM public.events
    WHERE id = v_event_id
    FOR SHARE;

    IF v_event_status <> 'upcoming'
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
    SET
      status = p_status
    WHERE id = p_attendance_id;

    -- 決済レコードの処理
    IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
      -- 既存の決済レコードを確認（ステータスも取得）
      SELECT id, status INTO v_payment_id, v_payment_status
      FROM public.payments
      WHERE attendance_id = p_attendance_id
      ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
      LIMIT 1;

      IF v_payment_id IS NOT NULL THEN
        -- 既存の決済レコードを更新
        IF v_payment_status IN ('paid', 'received', 'completed') THEN
          -- ステータスを維持したまま method / amount のみ変更（rollback 衝突回避）
          UPDATE public.payments
          SET
            method = p_payment_method,
            amount = p_event_fee
          WHERE id = v_payment_id;
        ELSE
          -- 未決済系ステータスは pending へリセット
          UPDATE public.payments
          SET
            method = p_payment_method,
            amount = p_event_fee,
            status = 'pending'
          WHERE id = v_payment_id;
        END IF;
      ELSE
        -- 新しい決済レコードを作成
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
      -- 既存の決済レコードを取得
      SELECT id, status, method INTO v_payment_id, v_payment_status, v_payment_method
      FROM public.payments
      WHERE attendance_id = p_attendance_id
      ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
      LIMIT 1;

      IF FOUND THEN
        IF v_payment_status IN ('pending', 'failed') THEN
          DELETE FROM public.payments WHERE id = v_payment_id;
          INSERT INTO public.system_logs(operation_type, details)
          VALUES ('unpaid_payment_deleted', jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id, 'previousStatus', v_payment_status));
        ELSIF v_payment_status IN ('paid', 'received', 'completed') THEN
          IF v_payment_method = 'cash' THEN
            UPDATE public.payments
            SET status = 'refunded'
            WHERE id = v_payment_id;
            INSERT INTO public.system_logs(operation_type, details)
            VALUES ('cash_refund_recorded', jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id));
          ELSE
            INSERT INTO public.system_logs(operation_type, details)
            VALUES ('stripe_refund_required', jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id));
          END IF;
        ELSIF v_payment_status = 'waived' THEN
          INSERT INTO public.system_logs(operation_type, details)
          VALUES ('waived_payment_kept', jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id));
        END IF;
      END IF;
    END IF;

    RETURN;
  END;
  $function$;

  -- ====================================================================
  -- 権限設定: SERVICE_ROLE のみ EXECUTE 可能とし、その他のロールから権限を剥奪
  -- ====================================================================
  REVOKE EXECUTE ON FUNCTION public.update_guest_attendance_with_payment(UUID,
    public.attendance_status_enum,
    public.payment_method_enum,
    INTEGER) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.update_guest_attendance_with_payment(UUID,
    public.attendance_status_enum,
    public.payment_method_enum,
    INTEGER) TO service_role;

END;
$$;
