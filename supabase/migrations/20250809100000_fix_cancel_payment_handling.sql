-- ====================================================================
-- 修正: 参加キャンセル時の決済処理の安全化
-- - pending/failed: 削除
-- - paid/received/completed: レコード保持、返金要求をログ（Stripeはアプリ層で返金後にrefundedへ）
-- - waived: 維持
-- ====================================================================

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
AS $$
DECLARE
  v_event_id UUID;
  v_payment_id UUID;
  v_current_status public.attendance_status_enum;
  v_capacity INTEGER;
  v_current_attendees INTEGER;
  v_payment_status public.payment_status_enum;
  v_payment_method public.payment_method_enum;
BEGIN
  -- 参加記録の存在確認と現在のステータス取得
  SELECT event_id, status INTO v_event_id, v_current_status
  FROM public.attendances
  WHERE id = p_attendance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found';
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
    status = p_status,
    updated_at = NOW()
  WHERE id = p_attendance_id;

  -- 決済レコードの処理
  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
    -- 既存の決済レコードを確認
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE attendance_id = p_attendance_id
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      -- 既存の決済レコードを更新
      UPDATE public.payments
      SET
        method = p_payment_method,
        amount = p_event_fee,
        status = 'pending',
        updated_at = NOW()
      WHERE id = v_payment_id;
    ELSE
      -- 新しい決済レコードを作成
      INSERT INTO public.payments (
        attendance_id,
        amount,
        method,
        status,
        created_at,
        updated_at
      ) VALUES (
        p_attendance_id,
        p_event_fee,
        p_payment_method,
        'pending',
        NOW(),
        NOW()
      );
    END IF;
  ELSIF p_status != 'attending' THEN
    -- 既存の決済レコードを取得
    SELECT id, status, method INTO v_payment_id, v_payment_status, v_payment_method
    FROM public.payments
    WHERE attendance_id = p_attendance_id
    ORDER BY updated_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_payment_status IN ('pending', 'failed') THEN
        -- 未決済は削除（監査ログを記録）
        DELETE FROM public.payments WHERE id = v_payment_id;
        PERFORM 1;
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'unpaid_payment_deleted',
          jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id, 'previousStatus', v_payment_status)
        );
      ELSIF v_payment_status IN ('paid', 'received', 'completed') THEN
        -- 決済済みは削除せず、返金フローへ
        IF v_payment_method = 'cash' THEN
          -- 現金は即時にrefundedへ
          UPDATE public.payments
          SET status = 'refunded', updated_at = NOW()
          WHERE id = v_payment_id;
          -- 監査ログ
          INSERT INTO public.system_logs(operation_type, details)
          VALUES (
            'cash_refund_recorded',
            jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id)
          );
        ELSE
          -- Stripeは返金要求をログし、レコードは維持（アプリ層で返金実行後にrefundedへ）
          INSERT INTO public.system_logs(operation_type, details)
          VALUES (
            'stripe_refund_required',
            jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id)
          );
        END IF;
      ELSIF v_payment_status = 'waived' THEN
        -- 免除は維持（必要に応じてログ）
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'waived_payment_kept',
          jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id)
        );
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;
