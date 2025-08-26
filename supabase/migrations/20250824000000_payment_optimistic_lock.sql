-- 楽観的ロック実装：payments テーブルに version 列を追加
-- 同時更新による Lost Update を防止

-- 1. payments テーブルに version 列を追加
ALTER TABLE payments
ADD COLUMN version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN payments.version IS 'Optimistic lock version to prevent concurrent updates';

-- 2. version を自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_payment_version()
RETURNS TRIGGER AS $$
BEGIN
  -- UPDATE 時に version を自動インクリメント（手動更新された場合のフォールバック）
  IF TG_OP = 'UPDATE' AND OLD.version = NEW.version THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. payments テーブルに version 自動更新トリガーを追加
DROP TRIGGER IF EXISTS trigger_update_payment_version ON payments;
CREATE TRIGGER trigger_update_payment_version
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_version();

-- 4. 楽観的ロック付き決済ステータス更新 RPC
CREATE OR REPLACE FUNCTION rpc_update_payment_status_safe(
  p_payment_id       uuid,
  p_new_status       payment_status_enum,
  p_expected_version integer,
  p_user_id          uuid,
  p_notes            text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER AS $$
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
  UPDATE payments
  SET status = p_new_status,
      paid_at = CASE
        WHEN p_new_status = 'received' THEN now()
        WHEN p_new_status = 'waived' THEN paid_at  -- 免除時はpaid_atは変更しない
        ELSE paid_at
      END,
      version = version + 1
  WHERE id = p_payment_id
    AND version = p_expected_version
    AND method = 'cash';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- バージョン競合検出
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Concurrent update detected for payment %', p_payment_id
      USING ERRCODE = '40001'; -- serialization_failure
  END IF;

  -- 3. 監査ログ記録
  INSERT INTO system_logs (operation_type, details, created_at)
  VALUES (
    'payment_status_update_safe',
    jsonb_build_object(
      'payment_id', p_payment_id,
      'old_status', v_payment_record.status,
      'new_status', p_new_status,
      'expected_version', p_expected_version,
      'new_version', v_payment_record.version + 1,
      'user_id', p_user_id,
      'notes', p_notes,
      'event_id', v_event_record.id,
      'attendance_id', v_attendance_record.id
    ),
    now()
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

-- 5. 一括更新用 RPC（内部で safe 版を呼ぶ）
CREATE OR REPLACE FUNCTION rpc_bulk_update_payment_status_safe(
  p_payment_updates jsonb, -- [{"payment_id": "uuid", "expected_version": 1, "new_status": "received"}]
  p_user_id         uuid,
  p_notes           text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER AS $$
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

  -- 一括処理の監査ログ
  INSERT INTO system_logs (operation_type, details, created_at)
  VALUES (
    'payment_bulk_status_update_safe',
    jsonb_build_object(
      'user_id', p_user_id,
      'total_count', jsonb_array_length(p_payment_updates),
      'success_count', v_success_count,
      'failure_count', v_failure_count,
      'failures', v_failures,
      'notes', p_notes
    ),
    now()
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

-- 6. サービスロール（admin）のみに実行権限付与
GRANT EXECUTE ON FUNCTION rpc_update_payment_status_safe TO service_role;
GRANT EXECUTE ON FUNCTION rpc_bulk_update_payment_status_safe TO service_role;

-- 7. インデックス追加（version を含む複合クエリの最適化）
CREATE INDEX IF NOT EXISTS idx_payments_id_version ON payments(id, version);

-- 8. 既存レコードの version 初期化（すべて 1 で開始）
-- DEFAULT 1 が設定されているので、新規 INSERT は自動的に 1 から開始される
UPDATE payments SET version = 1 WHERE version IS NULL;

COMMENT ON FUNCTION rpc_update_payment_status_safe IS 'Optimistic-lock aware payment status update with audit logging';
COMMENT ON FUNCTION rpc_bulk_update_payment_status_safe IS 'Bulk payment status update with optimistic locking and detailed failure reporting';
