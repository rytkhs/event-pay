-- 孤立ユーザークリーンアップ機能
-- 定期的にauth.usersに存在するがpublic.usersに存在しないユーザーを検出・削除

-- 孤立ユーザー検出関数
CREATE OR REPLACE FUNCTION detect_orphaned_users()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id as user_id,
    au.email,
    au.created_at
  FROM auth.users au
  LEFT JOIN public.users pu ON au.id = pu.id
  WHERE pu.id IS NULL
    AND au.created_at < NOW() - INTERVAL '10 minutes' -- 10分以上前のユーザーのみ対象
    AND au.email IS NOT NULL; -- メールアドレスが存在するもののみ
END;
$$;

-- 孤立ユーザー削除関数（手動実行用）
CREATE OR REPLACE FUNCTION cleanup_orphaned_user(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_exists boolean := false;
  profile_exists boolean := false;
BEGIN
  -- auth.usersに存在確認
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = target_user_id) INTO user_exists;
  
  -- public.usersに存在確認
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = target_user_id) INTO profile_exists;
  
  -- 孤立ユーザーの場合のみ削除実行
  IF user_exists AND NOT profile_exists THEN
    -- auth.usersから削除（CASCADE設定により関連データも削除される）
    DELETE FROM auth.users WHERE id = target_user_id;
    
    -- ログ記録
    INSERT INTO public.system_logs (level, message, metadata, created_at)
    VALUES (
      'INFO',
      'Orphaned user cleaned up',
      jsonb_build_object(
        'user_id', target_user_id,
        'cleanup_type', 'manual'
      ),
      NOW()
    );
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- システムログテーブル（存在しない場合のみ作成）
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'system_logs') THEN
    CREATE TABLE public.system_logs (
      id bigserial PRIMARY KEY,
      level text NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
      message text NOT NULL,
      metadata jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT NOW()
    );
    
    -- インデックス作成
    CREATE INDEX idx_system_logs_created_at ON public.system_logs(created_at);
    CREATE INDEX idx_system_logs_level ON public.system_logs(level);
    
    -- RLS設定（管理者のみアクセス可能）
    ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
    
    -- 管理者ロール用ポリシー（将来実装予定）
    CREATE POLICY "system_logs_admin_only" ON public.system_logs
      FOR ALL TO authenticated
      USING (false); -- 現在は全てブロック、管理者機能実装時に修正
  END IF;
END
$$;

-- 孤立ユーザークリーンアップ統計関数
CREATE OR REPLACE FUNCTION get_orphaned_users_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_auth_users', (SELECT COUNT(*) FROM auth.users),
    'total_profile_users', (SELECT COUNT(*) FROM public.users),
    'orphaned_users_count', (
      SELECT COUNT(*)
      FROM auth.users au
      LEFT JOIN public.users pu ON au.id = pu.id
      WHERE pu.id IS NULL
        AND au.created_at < NOW() - INTERVAL '10 minutes'
    ),
    'last_cleanup_check', NOW()
  ) INTO stats;
  
  RETURN stats;
END;
$$;

-- 関数の実行権限設定
GRANT EXECUTE ON FUNCTION detect_orphaned_users() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_orphaned_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_orphaned_users_stats() TO service_role;

-- コメント追加
COMMENT ON FUNCTION detect_orphaned_users() IS '孤立ユーザー（auth.usersに存在するがpublic.usersに存在しないユーザー）を検出';
COMMENT ON FUNCTION cleanup_orphaned_user(uuid) IS '指定された孤立ユーザーを安全に削除';
COMMENT ON FUNCTION get_orphaned_users_stats() IS '孤立ユーザーの統計情報を取得';