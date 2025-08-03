CREATE OR REPLACE FUNCTION public.register_attendance_with_payment(
  p_event_id UUID,
  p_nickname VARCHAR,
  p_email VARCHAR,
  p_status public.attendance_status_enum,
  p_guest_token VARCHAR,
  p_payment_method public.payment_method_enum DEFAULT NULL,
  p_event_fee INTEGER DEFAULT 0
)
RETURNS UUID -- 新しく作成されたattendanceのIDを返す
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attendance_id UUID;
  v_event_exists BOOLEAN;
BEGIN
  -- 入力パラメータの検証
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

  IF p_guest_token IS NULL OR LENGTH(p_guest_token) != 32 THEN
    RAISE EXCEPTION 'Guest token must be exactly 32 characters long, got: %', COALESCE(LENGTH(p_guest_token), 0);
  END IF;

  -- イベントの存在確認
  SELECT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id) INTO v_event_exists;
  IF NOT v_event_exists THEN
    RAISE EXCEPTION 'Event with ID % does not exist', p_event_id;
  END IF;

  -- ゲストトークンの重複チェック
  IF EXISTS(SELECT 1 FROM public.attendances WHERE guest_token = p_guest_token) THEN
    RAISE EXCEPTION 'Guest token already exists: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  -- 1. attendancesテーブルに参加記録を挿入
  BEGIN
    INSERT INTO public.attendances (event_id, nickname, email, status, guest_token)
    VALUES (p_event_id, p_nickname, p_email, p_status, p_guest_token)
    RETURNING id INTO v_attendance_id;

    -- 挿入が成功したかを確認
    IF v_attendance_id IS NULL THEN
      RAISE EXCEPTION 'Failed to insert attendance record';
    END IF;

  EXCEPTION
    WHEN unique_violation THEN
      -- 重複エラーの詳細を提供
      IF SQLSTATE = '23505' AND CONSTRAINT_NAME = 'attendances_guest_token_key' THEN
        RAISE EXCEPTION 'Guest token already exists (unique constraint violation): %', LEFT(p_guest_token, 8) || '...';
      ELSE
        RAISE EXCEPTION 'Unique constraint violation: %', SQLERRM;
      END IF;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to insert attendance: %', SQLERRM;
  END;

  -- 2. 参加ステータスが'attending'で、イベントが有料の場合、paymentsテーブルに決済記録を挿入
  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
    BEGIN
      INSERT INTO public.payments (attendance_id, amount, method, status)
      VALUES (v_attendance_id, p_event_fee, p_payment_method, 'pending');
    EXCEPTION
      WHEN OTHERS THEN
        -- 決済記録の挿入に失敗した場合、参加記録も削除してロールバック
        DELETE FROM public.attendances WHERE id = v_attendance_id;
        RAISE EXCEPTION 'Failed to insert payment record: %', SQLERRM;
    END;
  END IF;

  RETURN v_attendance_id;
END;
$$;
