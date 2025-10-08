-- ================================================================
-- Migration: Add audit logs to register_attendance_with_payment RPC
-- Description: 参加登録RPC内に system_logs への監査ログ記録を追加
-- Date: 2025-10-08
-- ================================================================

-- register_attendance_with_payment 関数を更新（監査ログ追加版）
CREATE OR REPLACE FUNCTION "public"."register_attendance_with_payment"(
  "p_event_id" "uuid",
  "p_nickname" character varying,
  "p_email" character varying,
  "p_status" "public"."attendance_status_enum",
  "p_guest_token" character varying,
  "p_payment_method" "public"."payment_method_enum" DEFAULT NULL::"public"."payment_method_enum",
  "p_event_fee" integer DEFAULT 0
) RETURNS "uuid"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $_$
DECLARE
  v_attendance_id UUID;
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

  -- ゲストトークンの検証
  IF p_guest_token IS NULL OR LENGTH(p_guest_token) != 36 THEN
    RAISE EXCEPTION 'Guest token must be exactly 36 characters long with gst_ prefix, got: %', COALESCE(LENGTH(p_guest_token), 0);
  END IF;

  -- ゲストトークンの形式を検証
  IF NOT (p_guest_token ~ '^gst_[a-zA-Z0-9_-]{32}$') THEN
    RAISE EXCEPTION 'Guest token must have format gst_[32 alphanumeric chars], got: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  -- 【レースコンディション対策強化】イベント存在確認と定員チェック（attending状態の場合のみ）
  IF p_status = 'attending' THEN
    DECLARE
      v_capacity INTEGER;
      v_current_attendees INTEGER;
    BEGIN
      -- 【重要】イベント情報を排他ロック付きで取得（レースコンディション対策）
      -- 存在確認と定員取得を一度に実行
      SELECT capacity INTO v_capacity
      FROM public.events
      WHERE id = p_event_id FOR UPDATE;

      -- イベントが存在しない場合、v_capacity は NULL になる
      IF v_capacity IS NULL AND NOT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id) THEN
        RAISE EXCEPTION 'Event with ID % does not exist', p_event_id;
      END IF;

      -- 定員が設定されている場合のみチェック
      IF v_capacity IS NOT NULL THEN
        -- 【重要】イベントが既にロックされているため、他のトランザクションは待機状態
        -- この時点で安全に参加者数をカウントできる
        SELECT COUNT(*) INTO v_current_attendees
        FROM public.attendances
        WHERE event_id = p_event_id AND status = 'attending';

        -- 定員超過チェック
        IF v_current_attendees >= v_capacity THEN
          RAISE EXCEPTION 'このイベントは定員（%名）に達しています', v_capacity
            USING ERRCODE = 'P0001',
                  DETAIL = format('Current attendees: %s, Capacity: %s', v_current_attendees, v_capacity),
                  HINT = 'Race condition prevented by exclusive lock';
        END IF;
      END IF;
    END;
  ELSE
    -- 参加ステータスが 'attending' 以外の場合、イベントの存在確認のみ実行
    IF NOT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id) THEN
      RAISE EXCEPTION 'Event with ID % does not exist', p_event_id;
    END IF;
  END IF;

  -- 負の金額の事前検証（セキュリティ強化）
  IF p_event_fee IS NOT NULL AND p_event_fee < 0 THEN
    RAISE EXCEPTION 'Event fee cannot be negative, got: %', p_event_fee;
  END IF;

  -- ゲストトークンの重複チェック
  IF EXISTS(SELECT 1 FROM public.attendances WHERE guest_token = p_guest_token) THEN
    RAISE EXCEPTION 'Guest token % already exists (duplicate request)', LEFT(p_guest_token, 8) || '...'
      USING ERRCODE = '23505',
            DETAIL = 'This guest token is already in use';
  END IF;

  -- 1. 参加記録を挿入
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
      -- UNIQUE制約違反の適切な処理
      DECLARE
        v_constraint_name TEXT;
      BEGIN
        -- 違反した制約名を取得
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

        -- 制約別のエラーメッセージ
        IF v_constraint_name = 'attendances_guest_token_key' OR SQLERRM LIKE '%guest_token%' THEN
          RAISE EXCEPTION 'Guest token already exists (concurrent request detected): %', LEFT(p_guest_token, 8) || '...'
            USING ERRCODE = '23505',
                  DETAIL = 'This may indicate a race condition or duplicate request';
        ELSE
          RAISE EXCEPTION 'Unique constraint violation: %', SQLERRM
            USING ERRCODE = '23505';
        END IF;
      END;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to insert attendance: %', SQLERRM;
  END;

  -- 2. 参加ステータスが'attending'で、イベントが有料の場合、paymentsテーブルに決済記録を挿入
  -- 注意: この時点では負の値チェックが完了しており、p_event_fee >= 0 が保証されている
  DECLARE
    v_payment_id UUID;
  BEGIN
    IF p_status = 'attending' AND p_event_fee IS NOT NULL AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
      BEGIN
        INSERT INTO public.payments (attendance_id, amount, method, status)
        VALUES (v_attendance_id, p_event_fee, p_payment_method, 'pending')
        RETURNING id INTO v_payment_id;
      EXCEPTION
        WHEN OTHERS THEN
          -- 決済記録の挿入に失敗した場合、参加記録も削除してロールバック
          DELETE FROM public.attendances WHERE id = v_attendance_id;
          RAISE EXCEPTION 'Failed to insert payment record: %', SQLERRM;
      END;
    END IF;

    -- 3. 監査ログ記録
    INSERT INTO public.system_logs (
      log_category,
      action,
      message,
      actor_type,
      resource_type,
      resource_id,
      outcome,
      metadata
    )
    VALUES (
      'attendance',
      'attendance.register',
      'Attendance registered',
      (CASE WHEN p_guest_token IS NOT NULL THEN 'guest' ELSE 'system' END)::actor_type_enum,
      'attendance',
      v_attendance_id::text,
      'success',
      jsonb_build_object(
        'event_id', p_event_id,
        'status', p_status,
        'has_payment', (v_payment_id IS NOT NULL),
        'payment_method', p_payment_method,
        'email', p_email
      )
    );
  END;

  RETURN v_attendance_id;
END;
$_$;

COMMENT ON FUNCTION "public"."register_attendance_with_payment"(
  "p_event_id" "uuid",
  "p_nickname" character varying,
  "p_email" character varying,
  "p_status" "public"."attendance_status_enum",
  "p_guest_token" character varying,
  "p_payment_method" "public"."payment_method_enum",
  "p_event_fee" integer
) IS 'Register attendance with automatic payment record creation and audit logging';
