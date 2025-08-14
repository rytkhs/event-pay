-- スケジューラー用行ロック機能の実装
-- 既存のアドバイザリロック方式を行ロック方式に置き換えて排他制御を確実にする

-- 1. スケジューラーロック管理テーブルの作成
CREATE TABLE scheduler_locks (
  lock_name text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  process_id text,
  -- ロック取得時の情報（デバッグ・監視用）
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- インデックス: 期限切れレコード検索用
CREATE INDEX idx_scheduler_locks_expires_at ON scheduler_locks (expires_at);

-- RLS設定（サービスロールのみアクセス可能）
ALTER TABLE scheduler_locks ENABLE ROW LEVEL SECURITY;

-- サービスロール（認証されたユーザー）からのアクセスを許可
-- スケジューラーは管理者権限で実行されるため
CREATE POLICY "Allow service role access to scheduler_locks" ON scheduler_locks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. ロック取得RPC関数
CREATE OR REPLACE FUNCTION try_acquire_scheduler_lock(
  p_lock_name text,
  p_ttl_minutes int DEFAULT 180,
  p_process_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _inserted boolean := false;
BEGIN
  -- 期限切れロックの自動削除
  DELETE FROM scheduler_locks
  WHERE lock_name = p_lock_name AND expires_at < now();

  -- ロック取得を試行
  BEGIN
    INSERT INTO scheduler_locks (
      lock_name,
      acquired_at,
      expires_at,
      process_id,
      metadata
    )
    VALUES (
      p_lock_name,
      now(),
      now() + (p_ttl_minutes || ' minutes')::interval,
      p_process_id,
      p_metadata
    );

    _inserted := true;

  EXCEPTION
    WHEN unique_violation THEN
      -- ロック取得失敗（既に他のプロセスが保持中）
      _inserted := false;
  END;

  RETURN _inserted;
END;
$$;

-- 3. ロック解放RPC関数
CREATE OR REPLACE FUNCTION release_scheduler_lock(
  p_lock_name text,
  p_process_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _deleted_count int := 0;
BEGIN
  -- process_id が指定されている場合は一致するもののみ削除
  IF p_process_id IS NOT NULL THEN
    DELETE FROM scheduler_locks
    WHERE lock_name = p_lock_name
      AND (process_id = p_process_id OR process_id IS NULL);
  ELSE
    -- process_id 未指定の場合は無条件削除
    DELETE FROM scheduler_locks
    WHERE lock_name = p_lock_name;
  END IF;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  RETURN _deleted_count > 0;
END;
$$;

-- 4. 期限切れロック自動削除RPC関数
CREATE OR REPLACE FUNCTION cleanup_expired_scheduler_locks()
RETURNS TABLE(
  deleted_count int,
  expired_locks jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _deleted_count int := 0;
  _expired_locks jsonb;
BEGIN
  -- 削除対象の期限切れロック情報を記録
  SELECT jsonb_agg(
    jsonb_build_object(
      'lock_name', lock_name,
      'acquired_at', acquired_at,
      'expires_at', expires_at,
      'process_id', process_id
    )
  ) INTO _expired_locks
  FROM scheduler_locks
  WHERE expires_at < now();

  -- 期限切れロックを削除
  DELETE FROM scheduler_locks
  WHERE expires_at < now();

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  RETURN QUERY SELECT _deleted_count, COALESCE(_expired_locks, '[]'::jsonb);
END;
$$;

-- 5. ロック状態確認RPC関数（監視・デバッグ用）
CREATE OR REPLACE FUNCTION get_scheduler_lock_status(p_lock_name text DEFAULT NULL)
RETURNS TABLE(
  lock_name text,
  acquired_at timestamptz,
  expires_at timestamptz,
  time_remaining_minutes int,
  process_id text,
  metadata jsonb,
  is_expired boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.lock_name,
    sl.acquired_at,
    sl.expires_at,
    EXTRACT(EPOCH FROM (sl.expires_at - now()) / 60)::int as time_remaining_minutes,
    sl.process_id,
    sl.metadata,
    sl.expires_at < now() as is_expired
  FROM scheduler_locks sl
  WHERE (p_lock_name IS NULL OR sl.lock_name = p_lock_name)
  ORDER BY sl.acquired_at DESC;
END;
$$;

-- 6. 既存のアドバイザリロック関数をdeprecated扱いに変更
-- 使用されなくなった関数はコメントで明示
CREATE OR REPLACE FUNCTION acquire_payout_scheduler_lock()
RETURNS boolean
LANGUAGE sql
AS $$
  -- DEPRECATED: 行ロック方式 (try_acquire_scheduler_lock) に移行済み
  -- この関数は互換性のためのみ保持。新しい実装では使用禁止
  SELECT false;
$$;

-- 7. コメント追加
COMMENT ON TABLE scheduler_locks IS 'スケジューラー排他制御用テーブル。行ロックによる確実な単一実行を保証する';
COMMENT ON FUNCTION try_acquire_scheduler_lock IS 'スケジューラーロック取得。TTL付きで自動期限切れを防ぐ';
COMMENT ON FUNCTION release_scheduler_lock IS 'スケジューラーロック解放。process_id指定で安全な解放が可能';
COMMENT ON FUNCTION cleanup_expired_scheduler_locks IS '期限切れロックの一括削除。定期的な実行を推奨';
COMMENT ON FUNCTION get_scheduler_lock_status IS 'ロック状態の監視・デバッグ用関数';
