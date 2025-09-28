-- =============================================
-- 主催者用参加者追加RPC関数
-- レースコンディション対策付きの安全な実装
-- =============================================

CREATE OR REPLACE FUNCTION "public"."admin_add_attendance_with_capacity_check"(
  "p_event_id" "uuid",
  "p_nickname" character varying,
  "p_email" character varying,
  "p_status" "public"."attendance_status_enum",
  "p_guest_token" character varying,
  "p_bypass_capacity" boolean DEFAULT false
) RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
  v_attendance_id UUID;
  v_capacity INTEGER;
  v_current_count INTEGER;
  v_event_creator_id UUID;
  v_current_user_id UUID;
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

  IF p_guest_token IS NULL OR LENGTH(TRIM(p_guest_token)) = 0 THEN
    RAISE EXCEPTION 'Guest token cannot be null or empty';
  END IF;

  -- 現在のユーザーIDを取得
  v_current_user_id := auth.uid();
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated' USING ERRCODE = '42501';
  END IF;

  -- イベント情報を排他ロック付きで取得（レースコンディション対策）
  SELECT capacity, created_by INTO v_capacity, v_event_creator_id
  FROM public.events
  WHERE id = p_event_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;

  -- 主催者権限チェック
  IF v_event_creator_id != v_current_user_id THEN
    RAISE EXCEPTION 'Only event creator can add participants' USING ERRCODE = '42501';
  END IF;

  -- ゲストトークンの重複チェック
  IF EXISTS(SELECT 1 FROM public.attendances WHERE guest_token = p_guest_token) THEN
    RAISE EXCEPTION 'Guest token already exists: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  -- 定員チェック（attending追加時のみ、バイパスフラグがfalseの場合）
  IF p_status = 'attending' AND v_capacity IS NOT NULL AND NOT p_bypass_capacity THEN
    -- 排他ロック取得済みのため、安全に参加者数をカウント
    SELECT COUNT(*) INTO v_current_count
    FROM public.attendances
    WHERE event_id = p_event_id AND status = 'attending';

    -- 定員超過チェック
    IF v_current_count >= v_capacity THEN
      RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_count
        USING ERRCODE = 'P0001',
              DETAIL = format('Current: %s, Capacity: %s, Bypass: %s', v_current_count, v_capacity, p_bypass_capacity),
              HINT = 'Set bypass_capacity=true to override capacity limit';
    END IF;
  END IF;

  -- 参加記録を挿入
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

  RETURN v_attendance_id;
END;
$$;

-- 関数の所有者設定
ALTER FUNCTION "public"."admin_add_attendance_with_capacity_check"(
  "uuid", character varying, character varying, "public"."attendance_status_enum",
  character varying, boolean
) OWNER TO "postgres";

-- 関数のコメント
COMMENT ON FUNCTION "public"."admin_add_attendance_with_capacity_check"(
  "uuid", character varying, character varying, "public"."attendance_status_enum",
  character varying, boolean
) IS '主催者用参加者追加関数（レースコンディション対策付き）。排他ロックによる定員チェックと主催者権限確認を実行。';
