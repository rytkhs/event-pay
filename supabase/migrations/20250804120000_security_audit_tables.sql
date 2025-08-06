-- EventPay: セキュリティ監査テーブル作成
-- 目的: データベースアクセスの監査とセキュリティ違反の検知機能を提供する

-- ====================================================================
-- 1. ENUM型定義
-- ====================================================================

-- 管理者権限使用理由のENUM型
CREATE TYPE public.admin_reason_enum AS ENUM (
    'user_cleanup',
    'test_data_setup', 
    'system_maintenance',
    'emergency_access',
    'data_migration',
    'security_investigation'
);

-- 疑わしい活動の種類
CREATE TYPE public.suspicious_activity_type_enum AS ENUM (
    'EMPTY_RESULT_SET',
    'ADMIN_ACCESS_ATTEMPT', 
    'INVALID_TOKEN_PATTERN',
    'RATE_LIMIT_EXCEEDED',
    'UNAUTHORIZED_RLS_BYPASS',
    'BULK_DATA_ACCESS',
    'UNUSUAL_ACCESS_PATTERN'
);

-- セキュリティレベル
CREATE TYPE public.security_severity_enum AS ENUM (
    'LOW',
    'MEDIUM', 
    'HIGH',
    'CRITICAL'
);

-- ====================================================================
-- 2. セキュリティ監査テーブル定義
-- ====================================================================

-- 管理者アクセス監査テーブル
CREATE TABLE public.admin_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason public.admin_reason_enum NOT NULL,
    context TEXT NOT NULL,
    operation_details JSONB,
    ip_address INET,
    user_agent TEXT,
    accessed_tables TEXT[],
    session_id TEXT,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ゲストアクセス監査テーブル
CREATE TABLE public.guest_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_token_hash VARCHAR(64) NOT NULL, -- SHA-256ハッシュ化されたトークン
    attendance_id UUID REFERENCES public.attendances(id) ON DELETE SET NULL,
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    operation_type VARCHAR(20), -- SELECT, INSERT, UPDATE, DELETE
    success BOOLEAN NOT NULL,
    result_count INTEGER, -- 取得/影響した行数
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    duration_ms INTEGER,
    error_code VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 疑わしい活動ログテーブル
CREATE TABLE public.suspicious_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_type public.suspicious_activity_type_enum NOT NULL,
    table_name VARCHAR(100),
    user_role VARCHAR(50),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    attempted_action VARCHAR(100),
    expected_result_count INTEGER,
    actual_result_count INTEGER,
    context JSONB,
    severity public.security_severity_enum DEFAULT 'MEDIUM',
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    detection_method VARCHAR(100), -- どの方法で検知されたか
    false_positive BOOLEAN DEFAULT FALSE, -- 誤検知フラグ
    investigated_at TIMESTAMP WITH TIME ZONE,
    investigated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    investigation_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 不正アクセス試行ログテーブル
CREATE TABLE public.unauthorized_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempted_resource VARCHAR(200) NOT NULL,
    required_permission VARCHAR(100),
    user_context JSONB,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_token_hash VARCHAR(64), -- ゲストアクセスの場合
    detection_method VARCHAR(50) NOT NULL, -- 'EMPTY_RESULT', 'PERMISSION_CHECK', 'RATE_LIMIT', 'RLS_POLICY'
    blocked_by_rls BOOLEAN DEFAULT FALSE,
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    request_path VARCHAR(500),
    request_method VARCHAR(10),
    request_headers JSONB,
    response_status INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ====================================================================
-- 3. パフォーマンス最適化インデックス
-- ====================================================================

-- 管理者アクセス監査用インデックス
CREATE INDEX IF NOT EXISTS idx_admin_access_audit_created_at_reason 
ON public.admin_access_audit (created_at DESC, reason);

CREATE INDEX IF NOT EXISTS idx_admin_access_audit_user_id_created_at 
ON public.admin_access_audit (user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_access_audit_failed_access 
ON public.admin_access_audit (created_at DESC, reason) 
WHERE success = FALSE;

-- ゲストアクセス監査用インデックス
CREATE INDEX IF NOT EXISTS idx_guest_access_audit_token_hash_created_at 
ON public.guest_access_audit (guest_token_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guest_access_audit_created_at 
ON public.guest_access_audit (created_at DESC) 
WHERE success = FALSE; -- 失敗したアクセスの高速検索用

CREATE INDEX IF NOT EXISTS idx_guest_access_audit_attendance_id 
ON public.guest_access_audit (attendance_id, created_at DESC) 
WHERE attendance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guest_access_audit_event_id 
ON public.guest_access_audit (event_id, created_at DESC) 
WHERE event_id IS NOT NULL;

-- 疑わしい活動ログ用インデックス
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_log_created_at_severity 
ON public.suspicious_activity_log (created_at DESC, severity) 
WHERE severity IN ('HIGH', 'CRITICAL');

CREATE INDEX IF NOT EXISTS idx_suspicious_activity_log_activity_type 
ON public.suspicious_activity_log (activity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_suspicious_activity_log_uninvestigated 
ON public.suspicious_activity_log (created_at DESC) 
WHERE investigated_at IS NULL AND severity IN ('HIGH', 'CRITICAL');

CREATE INDEX IF NOT EXISTS idx_suspicious_activity_log_user_id 
ON public.suspicious_activity_log (user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- 不正アクセス試行ログ用インデックス
CREATE INDEX IF NOT EXISTS idx_unauthorized_access_log_created_at 
ON public.unauthorized_access_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_unauthorized_access_log_detection_method 
ON public.unauthorized_access_log (detection_method, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_unauthorized_access_log_ip_address 
ON public.unauthorized_access_log (ip_address, created_at DESC) 
WHERE ip_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unauthorized_access_log_user_id 
ON public.unauthorized_access_log (user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unauthorized_access_log_guest_token 
ON public.unauthorized_access_log (guest_token_hash, created_at DESC) 
WHERE guest_token_hash IS NOT NULL;

-- ====================================================================
-- 4. RLSポリシー設定
-- ====================================================================

-- 全ての監査テーブルでRLSを有効化
ALTER TABLE public.admin_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspicious_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unauthorized_access_log ENABLE ROW LEVEL SECURITY;

-- 管理者アクセス監査テーブル: service_roleのみアクセス可能
CREATE POLICY "Service role can access admin audit logs" 
ON public.admin_access_audit 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 認証済みユーザーは自分の監査ログのみ閲覧可能
CREATE POLICY "Users can view own admin audit logs" 
ON public.admin_access_audit 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- ゲストアクセス監査テーブル: service_roleのみアクセス可能
CREATE POLICY "Service role can access guest audit logs" 
ON public.guest_access_audit 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 疑わしい活動ログテーブル: service_roleのみアクセス可能
CREATE POLICY "Service role can access suspicious activity logs" 
ON public.suspicious_activity_log 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 不正アクセス試行ログテーブル: service_roleのみアクセス可能
CREATE POLICY "Service role can access unauthorized access logs" 
ON public.unauthorized_access_log 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- ====================================================================
-- 5. 権限設定
-- ====================================================================

-- service_roleに全ての監査テーブルへの権限を付与
GRANT ALL ON public.admin_access_audit TO service_role;
GRANT ALL ON public.guest_access_audit TO service_role;
GRANT ALL ON public.suspicious_activity_log TO service_role;
GRANT ALL ON public.unauthorized_access_log TO service_role;

-- ====================================================================
-- 6. ヘルパー関数
-- ====================================================================

-- ゲストトークンをSHA-256でハッシュ化する関数
CREATE OR REPLACE FUNCTION public.hash_guest_token(token TEXT)
RETURNS VARCHAR(64)
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
AS $$
BEGIN
    -- SHA-256ハッシュを生成（PostgreSQLのdigest関数を使用）
    RETURN encode(digest(token, 'sha256'), 'hex');
END;
$$;

-- セキュリティ監査ログのクリーンアップ関数（古いログを削除）
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- 管理者アクセス監査ログのクリーンアップ
    DELETE FROM public.admin_access_audit 
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- ゲストアクセス監査ログのクリーンアップ
    DELETE FROM public.guest_access_audit 
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- 疑わしい活動ログのクリーンアップ（調査済みのもののみ）
    DELETE FROM public.suspicious_activity_log 
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days
    AND investigated_at IS NOT NULL;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- 不正アクセス試行ログのクリーンアップ
    DELETE FROM public.unauthorized_access_log 
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    RETURN deleted_count;
END;
$$;

-- service_roleのみ実行可能
GRANT EXECUTE ON FUNCTION public.hash_guest_token(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER) TO service_role;

-- ====================================================================
-- 7. コメント追加
-- ====================================================================

COMMENT ON TABLE public.admin_access_audit IS '管理者権限を使用したデータベースアクセスの監査ログ';
COMMENT ON TABLE public.guest_access_audit IS 'ゲストトークンを使用したアクセスの監査ログ';
COMMENT ON TABLE public.suspicious_activity_log IS '疑わしい活動やセキュリティ違反の可能性がある操作のログ';
COMMENT ON TABLE public.unauthorized_access_log IS '不正なアクセス試行や権限違反の記録';

COMMENT ON COLUMN public.guest_access_audit.guest_token_hash IS 'セキュリティのためSHA-256でハッシュ化されたゲストトークン';
COMMENT ON COLUMN public.suspicious_activity_log.false_positive IS '誤検知フラグ - 調査の結果、問題なしと判定された場合にTRUEに設定';
COMMENT ON COLUMN public.unauthorized_access_log.blocked_by_rls IS 'RLSポリシーによってアクセスがブロックされた場合にTRUE';

COMMENT ON FUNCTION public.hash_guest_token(TEXT) IS 'ゲストトークンをSHA-256でハッシュ化する関数（監査ログ用）';
COMMENT ON FUNCTION public.cleanup_old_audit_logs(INTEGER) IS '指定した日数より古い監査ログを削除する関数';

DO $$
BEGIN
    RAISE NOTICE '✅ Security audit tables, indexes, and policies created successfully.';
END $$;