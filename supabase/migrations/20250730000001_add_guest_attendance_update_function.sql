-- ゲスト参加状況更新のためのストアドプロシージャを作成

CREATE OR REPLACE FUNCTION update_guest_attendance_with_payment(
  p_attendance_id UUID,
  p_status public.attendance_status_enum,
  p_payment_method public.payment_method_enum DEFAULT NULL,
  p_event_fee INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
  v_payment_id UUID;
  v_current_status public.attendance_status_enum;
BEGIN
  -- 参加記録の存在確認と現在のステータス取得
  SELECT event_id, status INTO v_event_id, v_current_status
  FROM attendances 
  WHERE id = p_attendance_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found';
  END IF;

  -- 参加ステータスを更新
  UPDATE attendances 
  SET 
    status = p_status,
    updated_at = NOW()
  WHERE id = p_attendance_id;

  -- 決済レコードの処理
  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
    -- 既存の決済レコードを確認
    SELECT id INTO v_payment_id
    FROM payments 
    WHERE attendance_id = p_attendance_id;

    IF v_payment_id IS NOT NULL THEN
      -- 既存の決済レコードを更新
      UPDATE payments 
      SET 
        method = p_payment_method,
        amount = p_event_fee,
        status = 'pending',
        updated_at = NOW()
      WHERE id = v_payment_id;
    ELSE
      -- 新しい決済レコードを作成
      INSERT INTO payments (
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
    -- 参加しない場合は決済レコードを削除
    DELETE FROM payments WHERE attendance_id = p_attendance_id;
  END IF;

  -- 成功時はコミット（トランザクション内で実行される）
  RETURN;
END;
$$;