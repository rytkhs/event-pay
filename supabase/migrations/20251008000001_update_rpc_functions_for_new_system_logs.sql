-- ============================================================================
-- RPC関数を新しい system_logs スキーマに対応させる
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. rpc_update_payment_status_safe の更新
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."rpc_update_payment_status_safe"(
  "p_payment_id" "uuid",
  "p_new_status" "public"."payment_status_enum",
  "p_expected_version" integer,
  "p_user_id" "uuid",
  "p_notes" "text" DEFAULT NULL::"text"
) RETURNS json
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_updated_rows     integer;
  v_payment_record   payments%ROWTYPE;
  v_attendance_record attendances%ROWTYPE;
  v_event_record     events%ROWTYPE;
  v_result           json;
BEGIN
  -- 個別にSELECTして各ROWTYPE変数へ格納（複数 INTO 禁止エラー回避）
  SELECT *
    INTO v_payment_record
    FROM payments
   WHERE id = p_payment_id
   FOR UPDATE;

  -- 決済レコードが存在しない場合は即座にエラー
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found: %', p_payment_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_attendance_record
    FROM attendances
   WHERE id = v_payment_record.attendance_id;

  -- 参加記録が存在しない場合（理論上起こらないが念のため）
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found: %', v_payment_record.attendance_id
      USING ERRCODE = 'P0005';
  END IF;

  SELECT *
    INTO v_event_record
    FROM events
   WHERE id = v_attendance_record.event_id;

  -- イベントが存在しない場合（参照整合性欠如）
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event record not found: %', v_attendance_record.event_id
      USING ERRCODE = 'P0006';
  END IF;

  -- 主催者権限チェック
  IF v_event_record.created_by != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: User % is not the event creator', p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 現金決済でない場合はエラー
  IF v_payment_record.method != 'cash' THEN
    RAISE EXCEPTION 'Only cash payments can be manually updated'
      USING ERRCODE = 'P0003';
  END IF;

  -- 2. 楽観的ロック付きステータス更新

  -- キャンセル操作の場合はセッション変数を設定してトリガーをスキップ
  IF p_new_status = 'pending' AND v_payment_record.status IN ('received', 'waived') THEN
    PERFORM set_config('app.allow_payment_cancel', 'true', true);
  END IF;

  UPDATE payments
  SET status = p_new_status,
      paid_at = CASE
        WHEN p_new_status = 'received' THEN now()
        WHEN p_new_status = 'waived' THEN paid_at  -- 免除時はpaid_atは変更しない
        WHEN p_new_status = 'pending' THEN NULL    -- 未決済時はpaid_atをクリア
        ELSE paid_at
      END,
      version = version + 1
  WHERE id = p_payment_id
    AND version = p_expected_version
    AND method = 'cash';

  -- セッション変数をクリア
  IF p_new_status = 'pending' THEN
    PERFORM set_config('app.allow_payment_cancel', 'false', true);
  END IF;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- バージョン競合検出
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Concurrent update detected for payment %', p_payment_id
      USING ERRCODE = '40001'; -- serialization_failure
  END IF;

  -- 3. 監査ログ記録（新スキーマ対応）
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

  -- 4. 結果返却
  v_result := jsonb_build_object(
    'payment_id', p_payment_id,
    'status', p_new_status,
    'new_version', v_payment_record.version + 1,
    'updated_at', now()
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION "public"."rpc_update_payment_status_safe"(
  "p_payment_id" "uuid",
  "p_new_status" "public"."payment_status_enum",
  "p_expected_version" integer,
  "p_user_id" "uuid",
  "p_notes" "text"
) IS 'Optimistic-lock aware payment status update with audit logging (新system_logsスキーマ対応)';

-- ----------------------------------------------------------------------------
-- 2. rpc_bulk_update_payment_status_safe の更新
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."rpc_bulk_update_payment_status_safe"(
  "p_payment_updates" "jsonb",
  "p_user_id" "uuid",
  "p_notes" "text" DEFAULT NULL::"text"
) RETURNS json
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_update_item     jsonb;
  v_payment_id      uuid;
  v_expected_version integer;
  v_new_status      payment_status_enum;
  v_success_count   integer := 0;
  v_failure_count   integer := 0;
  v_failures        jsonb := '[]'::jsonb;
  v_result          json;
BEGIN
  -- 入力検証
  IF jsonb_array_length(p_payment_updates) > 50 THEN
    RAISE EXCEPTION 'Too many payments to update at once (max 50)'
      USING ERRCODE = 'P0004';
  END IF;

  -- 各決済を順次更新
  FOR v_update_item IN SELECT * FROM jsonb_array_elements(p_payment_updates)
  LOOP
    BEGIN
      v_payment_id := (v_update_item->>'payment_id')::uuid;
      v_expected_version := (v_update_item->>'expected_version')::integer;
      v_new_status := (v_update_item->>'new_status')::payment_status_enum;

      -- 個別の安全更新を実行
      PERFORM rpc_update_payment_status_safe(
        v_payment_id,
        v_new_status,
        v_expected_version,
        p_user_id,
        p_notes
      );

      v_success_count := v_success_count + 1;

    EXCEPTION
      WHEN OTHERS THEN
        v_failure_count := v_failure_count + 1;
        v_failures := v_failures || jsonb_build_object(
          'payment_id', v_payment_id,
          'error_code', SQLSTATE,
          'error_message', SQLERRM
        );
    END;
  END LOOP;

  -- 一括処理の監査ログ（新スキーマ対応）
  INSERT INTO public.system_logs (
    log_category,
    action,
    message,
    actor_type,
    user_id,
    resource_type,
    outcome,
    metadata
  )
  VALUES (
    'payment',
    'payment.bulk_status_update',
    format('Bulk payment status update completed: %s success, %s failures', v_success_count, v_failure_count),
    'user',
    p_user_id,
    'payment',
    CASE WHEN v_failure_count = 0 THEN 'success'::log_outcome_enum ELSE 'failure'::log_outcome_enum END,
    jsonb_build_object(
      'total_count', jsonb_array_length(p_payment_updates),
      'success_count', v_success_count,
      'failure_count', v_failure_count,
      'failures', v_failures,
      'notes', p_notes
    )
  );

  -- 結果返却
  v_result := jsonb_build_object(
    'success_count', v_success_count,
    'failure_count', v_failure_count,
    'failures', v_failures
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION "public"."rpc_bulk_update_payment_status_safe"(
  "p_payment_updates" "jsonb",
  "p_user_id" "uuid",
  "p_notes" "text"
) IS 'Bulk payment status update with optimistic locking and detailed failure reporting (新system_logsスキーマ対応)';

-- ----------------------------------------------------------------------------
-- 3. update_guest_attendance_with_payment の更新
-- ----------------------------------------------------------------------------

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
      IF v_payment_status IN ('paid', 'received', 'waived') THEN
        -- 既に確定済みの有効な決済がある場合は再利用（何もしない）
        -- 不参加→再参加の場合でも、既存の決済を維持する
        NULL; -- 明示的に何もしないことを示す
      ELSIF v_payment_status = 'refunded' THEN
        -- 返金済み = 決済が無効化されているため、新規決済レコードが必要
        v_payment_id := NULL;
      ELSIF v_payment_status = 'canceled' THEN
        -- キャンセル済みレコードは新規レコードを再作成するため再利用しない
        v_payment_id := NULL;
      ELSIF v_payment_status NOT IN ('paid', 'received', 'waived', 'refunded', 'canceled') THEN
        -- pending, failed などの未確定状態は更新可能
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

        -- 監査ログ記録（新スキーマ対応）
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
        -- 監査ログ記録（新スキーマ対応）
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
          'payment',
          'payment.status_maintained',
          'Payment status maintained on attendance cancel (already paid)',
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
      ELSIF v_payment_status = 'waived' THEN
        -- 監査ログ記録（新スキーマ対応）
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
          'payment',
          'payment.waived_kept',
          'Waived payment kept on attendance cancel',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'payment_status', v_payment_status,
            'attendance_status', p_status
          )
        );
      ELSIF v_payment_status = 'canceled' THEN
        -- 監査ログ記録（新スキーマ対応）
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
          'payment',
          'payment.canceled_duplicate',
          'Payment already canceled (duplicate cancel attempt)',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'payment_status', v_payment_status,
            'attendance_status', p_status
          )
        );
      ELSIF v_payment_status = 'refunded' THEN
        -- 監査ログ記録（新スキーマ対応）
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
          'payment',
          'payment.refund_maintained',
          'Refund status maintained on attendance cancel',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'payment_status', v_payment_status,
            'attendance_status', p_status
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION "public"."update_guest_attendance_with_payment"(
  "p_attendance_id" "uuid",
  "p_status" "public"."attendance_status_enum",
  "p_payment_method" "public"."payment_method_enum",
  "p_event_fee" integer
) IS 'Update guest attendance with payment handling (新system_logsスキーマ対応)';
