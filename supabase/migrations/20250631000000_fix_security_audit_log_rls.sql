-- ====================================================================
-- 🔒 セキュリティ監査ログテーブル RLS脆弱性修正
-- ====================================================================
-- 
-- 修正内容:
-- 1. Row Level Security (RLS) の有効化
-- 2. service_role専用アクセスポリシーの設定
-- 3. 一般ユーザーからの不要な権限剥奪
-- 
-- 背景:
-- security_audit_logテーブルは機密性の高いセキュリティ監査情報を含むため、
-- 管理者権限（service_role）のみがアクセス可能とし、
-- authenticated/anonロールからのアクセスを完全に遮断する必要がある。
-- ====================================================================

-- 1. Row Level Security (RLS) の有効化
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- 2. Force RLS を有効化（service_roleでもRLSポリシーを適用）
ALTER TABLE public.security_audit_log FORCE ROW LEVEL SECURITY;

-- 3. 既存の過度な権限を取り消し
-- anonymous ロールの権限を全て取り消し
REVOKE ALL ON public.security_audit_log FROM anon;

-- authenticated ロールの権限を全て取り消し  
REVOKE ALL ON public.security_audit_log FROM authenticated;

-- 4. service_role 専用のアクセスポリシーを作成
-- 注意: service_roleは特別なロールでRLSをバイパスする権限を持つが、
-- FORCE RLS により、このポリシーに従ってアクセス制御される

CREATE POLICY "security_audit_log_service_role_only" ON public.security_audit_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. 必要最小限の権限のみをservice_roleに付与
-- （SupabaseのデフォルトではすでにFULL権限があるが、明示的に設定）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_audit_log TO service_role;

-- 6. セキュリティ監査ログ記録関数のセキュリティレベルを更新
-- 既存関数をSECURITY DEFINERに変更（service_role権限で実行）
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_event_type TEXT,
    p_user_role TEXT DEFAULT NULL,
    p_query_attempted TEXT DEFAULT NULL,
    p_blocked_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- service_role権限で実行
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.security_audit_log (
        event_type,
        user_role,
        ip_address,
        query_attempted,
        blocked_reason,
        timestamp
    ) VALUES (
        p_event_type,
        p_user_role,
        COALESCE(inet_client_addr(), '127.0.0.1'::inet), -- クライアントIPを自動取得
        p_query_attempted,
        p_blocked_reason,
        NOW()
    );
END;
$$;

-- 7. 関数の実行権限をauthenticatedロールに付与
-- （認証済みユーザーがログ記録できるが、直接テーブルアクセスはできない）
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 8. テーブルコメントを更新
COMMENT ON TABLE public.security_audit_log IS 
'セキュリティ監査ログ - service_roleのみアクセス可能。認証・認可・レート制限などのセキュリティイベントを記録';

COMMENT ON POLICY "security_audit_log_service_role_only" ON public.security_audit_log IS 
'セキュリティ監査ログへのアクセスをservice_roleに限定するポリシー';

-- 9. 確認用クエリ（マイグレーション適用後の状態確認）
-- SELECT 'RLS Status:' as check_type, 
--        relname, 
--        relrowsecurity as rls_enabled, 
--        relforcerowsecurity as force_rls_enabled
-- FROM pg_class 
-- WHERE relname = 'security_audit_log';

-- SELECT 'Policies:' as check_type, 
--        schemaname, 
--        tablename, 
--        policyname, 
--        roles
-- FROM pg_policies 
-- WHERE tablename = 'security_audit_log';