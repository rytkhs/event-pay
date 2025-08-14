-- ハートビート用TTL延長RPC関数の追加
-- スケジューラー実行中にロックの有効期限を延長するために使用

-- TTL延長RPC関数
CREATE OR REPLACE FUNCTION extend_scheduler_lock(
  p_lock_name text,
  p_process_id text,
  p_extend_minutes int DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _updated_count int := 0;
BEGIN
  -- 指定されたプロセスIDのロックのTTLを延長
  UPDATE scheduler_locks
  SET expires_at = now() + (p_extend_minutes || ' minutes')::interval,
      metadata = metadata || jsonb_build_object('last_heartbeat', now()::text)
  WHERE lock_name = p_lock_name
    AND process_id = p_process_id
    AND expires_at > now(); -- 期限切れでないことを確認

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  -- 更新できた場合は成功
  RETURN _updated_count > 0;
END;
$$;

-- コメント追加
COMMENT ON FUNCTION extend_scheduler_lock IS 'スケジューラーロックのTTL延長（ハートビート用）。process_id一致時のみ延長可能';
