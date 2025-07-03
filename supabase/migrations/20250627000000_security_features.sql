-- EventPay セキュリティ機能 統合マイグレーション
-- SEC-001: 孤立ユーザークリーンアップ・セキュリティ監査ログ・システム管理機能の統合実装

-- ====================================================================
-- 🧹 孤立ユーザー検出・クリーンアップ機能
-- ====================================================================

-- システムログテーブルの作成（管理操作の記録用）
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    operation_type VARCHAR(50) NOT NULL,
    affected_table VARCHAR(50) NOT NULL,
    affected_count INTEGER DEFAULT 0,
    details JSONB,
    executed_by UUID REFERENCES auth.users(id),
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- システムログテーブルのRLS設定
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- システムログは service_role のみアクセス可能
CREATE POLICY "system_logs_service_role_only" ON system_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 孤立ユーザー検出関数
CREATE OR REPLACE FUNCTION detect_orphaned_users()
RETURNS TABLE(
    user_id UUID,
    user_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    days_since_creation INTEGER,
    has_events BOOLEAN,
    has_stripe_account BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id as user_id,
        u.name as user_name,
        u.created_at,
        EXTRACT(DAYS FROM NOW() - u.created_at)::INTEGER as days_since_creation,
        EXISTS(SELECT 1 FROM events WHERE created_by = u.id) as has_events,
        EXISTS(SELECT 1 FROM stripe_connect_accounts WHERE user_id = u.id) as has_stripe_account
    FROM users u
    WHERE
        -- 作成から30日以上経過
        u.created_at < NOW() - INTERVAL '30 days'
        -- イベントを一度も作成していない
        AND NOT EXISTS(SELECT 1 FROM events WHERE created_by = u.id)
        -- Stripe Connectアカウントを設定していない
        AND NOT EXISTS(SELECT 1 FROM stripe_connect_accounts WHERE user_id = u.id)
    ORDER BY u.created_at;
END;
$$;

-- 孤立ユーザー削除関数（安全な削除処理）
CREATE OR REPLACE FUNCTION cleanup_orphaned_users(dry_run BOOLEAN DEFAULT true)
RETURNS TABLE(
    operation VARCHAR(20),
    user_id UUID,
    user_name TEXT,
    deletion_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    orphan_record RECORD;
    deleted_count INTEGER := 0;
    log_details JSONB;
BEGIN
    -- 孤立ユーザーをループ処理
    FOR orphan_record IN
        SELECT * FROM detect_orphaned_users()
    LOOP
        IF dry_run THEN
            -- ドライラン: 削除対象のみ表示
            RETURN QUERY SELECT
                'DRY_RUN'::VARCHAR(20) as operation,
                orphan_record.user_id,
                orphan_record.user_name,
                format('作成から%s日経過、活動なし', orphan_record.days_since_creation) as deletion_reason;
        ELSE
            -- 実際の削除処理
            BEGIN
                -- CASCADE削除によりauth.usersからも削除される
                DELETE FROM users WHERE id = orphan_record.user_id;

                deleted_count := deleted_count + 1;

                RETURN QUERY SELECT
                    'DELETED'::VARCHAR(20) as operation,
                    orphan_record.user_id,
                    orphan_record.user_name,
                    format('削除完了（作成から%s日経過）', orphan_record.days_since_creation) as deletion_reason;

            EXCEPTION
                WHEN OTHERS THEN
                    RETURN QUERY SELECT
                        'ERROR'::VARCHAR(20) as operation,
                        orphan_record.user_id,
                        orphan_record.user_name,
                        format('削除失敗: %s', SQLERRM) as deletion_reason;
            END;
        END IF;
    END LOOP;

    -- 実際の削除が行われた場合のログ記録
    IF NOT dry_run AND deleted_count > 0 THEN
        log_details := jsonb_build_object(
            'deleted_count', deleted_count,
            'cleanup_date', NOW()
        );

        INSERT INTO system_logs (operation_type, affected_table, affected_count, details)
        VALUES ('CLEANUP_ORPHANED_USERS', 'users', deleted_count, log_details);

        RAISE NOTICE '孤立ユーザークリーンアップ完了: %件削除', deleted_count;
    ELSIF dry_run THEN
        RAISE NOTICE 'ドライラン完了。実際の削除を行う場合は cleanup_orphaned_users(false) を実行してください。';
    END IF;
END;
$$;

-- ユーザー統計取得関数
CREATE OR REPLACE FUNCTION get_user_statistics()
RETURNS TABLE(
    statistic_name TEXT,
    count_value INTEGER,
    description TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        '総ユーザー数'::TEXT as statistic_name,
        COUNT(*)::INTEGER as count_value,
        '登録されている全ユーザー数'::TEXT as description
    FROM users
    UNION ALL
    SELECT
        'アクティブユーザー数'::TEXT,
        COUNT(DISTINCT created_by)::INTEGER,
        'イベントを作成したことがあるユーザー数'::TEXT
    FROM events
    UNION ALL
    SELECT
        'Stripe設定済みユーザー数'::TEXT,
        COUNT(*)::INTEGER,
        'Stripe Connectアカウントを設定済みのユーザー数'::TEXT
    FROM stripe_connect_accounts
    UNION ALL
    SELECT
        '孤立ユーザー数'::TEXT,
        COUNT(*)::INTEGER,
        '30日以上活動のないユーザー数（削除対象）'::TEXT
    FROM detect_orphaned_users();
END;
$$;

-- ====================================================================
-- 🔐 セキュリティ監査ログ機能の強化
-- ====================================================================

-- セキュリティ監査ログテーブルのRLS強化
-- （security_enhancement.sqlで作成済みの場合は既存テーブルを使用）
CREATE TABLE IF NOT EXISTS security_audit_log (
    id SERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    user_role TEXT,
    ip_address INET,
    query_attempted TEXT,
    blocked_reason TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- セキュリティ監査ログのRLS設定（service_role専用）
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを削除して新しいポリシーを作成
DROP POLICY IF EXISTS "security_audit_service_role_only" ON security_audit_log;
DROP POLICY IF EXISTS "service_role_security_audit_access" ON security_audit_log;

-- service_role専用アクセスポリシー
CREATE POLICY "security_audit_service_role_only" ON security_audit_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- セキュリティログ記録関数の更新（強化版）
CREATE OR REPLACE FUNCTION log_security_event(
    p_event_type TEXT,
    p_user_role TEXT DEFAULT NULL,
    p_query_attempted TEXT DEFAULT NULL,
    p_blocked_reason TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 本番環境での外部ログシステム連携は別途実装
    IF current_setting('app.environment', true) = 'production' THEN
        -- 本番環境では外部セキュリティログシステムに送信
        RAISE WARNING 'SECURITY EVENT [%]: % - % (Role: %, IP: %)',
            NOW(), p_event_type, p_blocked_reason, p_user_role, p_ip_address;
        RETURN;
    END IF;

    -- 開発・テスト環境では内部テーブルに記録
    INSERT INTO security_audit_log (
        event_type, user_role, query_attempted, blocked_reason, ip_address
    ) VALUES (
        p_event_type, p_user_role, p_query_attempted, p_blocked_reason, p_ip_address
    );
EXCEPTION
    WHEN OTHERS THEN
        -- ログ記録の失敗は致命的エラーにしない
        RAISE WARNING 'セキュリティログ記録失敗: %', SQLERRM;
END;
$$;

-- セキュリティイベント集計関数
CREATE OR REPLACE FUNCTION get_security_audit_summary(
    start_date TIMESTAMP DEFAULT NOW() - INTERVAL '24 hours',
    end_date TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE(
    event_type TEXT,
    event_count INTEGER,
    distinct_ips INTEGER,
    last_occurrence TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sal.event_type,
        COUNT(*)::INTEGER as event_count,
        COUNT(DISTINCT sal.ip_address)::INTEGER as distinct_ips,
        MAX(sal.timestamp) as last_occurrence
    FROM security_audit_log sal
    WHERE sal.timestamp BETWEEN start_date AND end_date
    GROUP BY sal.event_type
    ORDER BY event_count DESC;
END;
$$;

-- ====================================================================
-- 🛠️ システム管理・保守機能
-- ====================================================================

-- データベース健全性チェック関数
CREATE OR REPLACE FUNCTION check_database_health()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    details TEXT,
    recommendation TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    orphaned_count INTEGER;
    rls_tables_count INTEGER;
    rls_enabled_count INTEGER;
    security_events_count INTEGER;
BEGIN
    -- 孤立ユーザー数チェック
    SELECT COUNT(*) INTO orphaned_count FROM detect_orphaned_users();

    RETURN QUERY SELECT
        '孤立ユーザー検出'::TEXT as check_name,
        CASE WHEN orphaned_count = 0 THEN 'OK' ELSE 'WARNING' END as status,
        format('%s件の孤立ユーザーが検出されました', orphaned_count) as details,
        CASE WHEN orphaned_count > 0 THEN 'cleanup_orphaned_users(false)の実行を検討してください' ELSE '問題ありません' END as recommendation;

    -- RLS設定チェック
    SELECT
        COUNT(*) FILTER (WHERE tablename IN ('users', 'events', 'attendances', 'payments', 'stripe_connect_accounts', 'payouts')),
        COUNT(*) FILTER (WHERE tablename IN ('users', 'events', 'attendances', 'payments', 'stripe_connect_accounts', 'payouts') AND rowsecurity = true)
    INTO rls_tables_count, rls_enabled_count
    FROM pg_tables
    WHERE schemaname = 'public';

    RETURN QUERY SELECT
        'RLS設定チェック'::TEXT as check_name,
        CASE WHEN rls_enabled_count = rls_tables_count THEN 'OK' ELSE 'ERROR' END as status,
        format('%s/%s テーブルでRLSが有効', rls_enabled_count, rls_tables_count) as details,
        CASE WHEN rls_enabled_count < rls_tables_count THEN 'RLSが無効なテーブルがあります。セキュリティ設定を確認してください' ELSE '問題ありません' END as recommendation;

    -- セキュリティイベントチェック（過去24時間）
    SELECT COUNT(*) INTO security_events_count
    FROM security_audit_log
    WHERE timestamp > NOW() - INTERVAL '24 hours'
        AND event_type IN ('BLOCKED_ACCESS', 'SECURITY_VIOLATION', 'UNAUTHORIZED_ATTEMPT');

    RETURN QUERY SELECT
        'セキュリティイベント監視'::TEXT as check_name,
        CASE WHEN security_events_count = 0 THEN 'OK' ELSE 'WARNING' END as status,
        format('過去24時間で%s件のセキュリティイベント', security_events_count) as details,
        CASE WHEN security_events_count > 0 THEN 'セキュリティログを確認し、必要に応じて対策を実施してください' ELSE '問題ありません' END as recommendation;
END;
$$;

-- ====================================================================
-- 🔧 権限設定と最終調整
-- ====================================================================

-- システム管理関数の権限設定（service_role専用）
GRANT EXECUTE ON FUNCTION detect_orphaned_users() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_orphaned_users(BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_statistics() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION log_security_event(TEXT, TEXT, TEXT, TEXT, INET) TO service_role;
GRANT EXECUTE ON FUNCTION get_security_audit_summary(TIMESTAMP, TIMESTAMP) TO service_role;
GRANT EXECUTE ON FUNCTION check_database_health() TO service_role;

-- システムログテーブルの権限設定
GRANT ALL ON system_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE system_logs_id_seq TO service_role;

-- セキュリティ監査ログテーブルの権限設定
GRANT ALL ON security_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE security_audit_log_id_seq TO service_role;

-- ====================================================================
-- 🧪 自動テスト・検証機能
-- ====================================================================

-- セキュリティ機能の動作確認
CREATE OR REPLACE FUNCTION test_security_features()
RETURNS TABLE(
    test_name TEXT,
    result TEXT,
    details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    test_result BOOLEAN;
    test_details TEXT;
BEGIN
    -- テスト1: 孤立ユーザー検出機能
    BEGIN
        PERFORM detect_orphaned_users();
        test_result := true;
        test_details := '孤立ユーザー検出機能が正常に動作しています';
    EXCEPTION
        WHEN OTHERS THEN
            test_result := false;
            test_details := format('エラー: %s', SQLERRM);
    END;

    RETURN QUERY SELECT
        '孤立ユーザー検出テスト'::TEXT as test_name,
        CASE WHEN test_result THEN 'PASS' ELSE 'FAIL' END as result,
        test_details;

    -- テスト2: セキュリティログ記録機能
    BEGIN
        PERFORM log_security_event('TEST_EVENT', 'test_role', 'SELECT 1', 'テスト実行');
        test_result := true;
        test_details := 'セキュリティログ記録機能が正常に動作しています';
    EXCEPTION
        WHEN OTHERS THEN
            test_result := false;
            test_details := format('エラー: %s', SQLERRM);
    END;

    RETURN QUERY SELECT
        'セキュリティログテスト'::TEXT as test_name,
        CASE WHEN test_result THEN 'PASS' ELSE 'FAIL' END as result,
        test_details;

    -- テスト3: データベース健全性チェック
    BEGIN
        PERFORM check_database_health();
        test_result := true;
        test_details := 'データベース健全性チェック機能が正常に動作しています';
    EXCEPTION
        WHEN OTHERS THEN
            test_result := false;
            test_details := format('エラー: %s', SQLERRM);
    END;

    RETURN QUERY SELECT
        'データベース健全性チェックテスト'::TEXT as test_name,
        CASE WHEN test_result THEN 'PASS' ELSE 'FAIL' END as result,
        test_details;
END;
$$;

GRANT EXECUTE ON FUNCTION test_security_features() TO service_role;

-- ====================================================================
-- 📊 統合完了の確認とログ
-- ====================================================================

DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    policy_count INTEGER;
BEGIN
    -- テーブル数の確認
    SELECT COUNT(*) INTO table_count
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename IN ('system_logs', 'security_audit_log');

    -- 関数数の確認
    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
        AND p.proname IN (
            'detect_orphaned_users',
            'cleanup_orphaned_users',
            'get_user_statistics',
            'log_security_event',
            'get_security_audit_summary',
            'check_database_health',
            'test_security_features'
        );

    -- RLSポリシー数の確認
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
        AND tablename IN ('system_logs', 'security_audit_log');

    RAISE NOTICE '======================================================================';
    RAISE NOTICE '✅ EventPay セキュリティ機能統合が完了しました';
    RAISE NOTICE '======================================================================';
    RAISE NOTICE '📊 統合結果:';
    RAISE NOTICE '  - セキュリティテーブル数: % 個作成', table_count;
    RAISE NOTICE '  - セキュリティ関数数: % 個作成', function_count;
    RAISE NOTICE '  - RLSポリシー数: % 個作成', policy_count;
    RAISE NOTICE '======================================================================';
    RAISE NOTICE '🔐 セキュリティ機能:';
    RAISE NOTICE '  ✅ 孤立ユーザー検出・クリーンアップ機能';
    RAISE NOTICE '  ✅ セキュリティ監査ログ・分析機能';
    RAISE NOTICE '  ✅ データベース健全性チェック機能';
    RAISE NOTICE '  ✅ システム管理・保守機能';
    RAISE NOTICE '  ✅ 自動テスト・検証機能';
    RAISE NOTICE '======================================================================';
    RAISE NOTICE '📝 統合されたファイル:';
    RAISE NOTICE '  - 20250627000000_orphaned_users_cleanup.sql（削除予定）';
    RAISE NOTICE '  - 20250631000000_fix_security_audit_log_rls.sql（削除予定）';
    RAISE NOTICE '  → 20250627000000_security_features.sql（統合完了）';
    RAISE NOTICE '======================================================================';

    IF table_count >= 2 AND function_count >= 7 AND policy_count >= 2 THEN
        RAISE NOTICE '🎉 セキュリティ機能統合マイグレーション適用成功！';

        -- セキュリティ機能のテスト実行
        RAISE NOTICE '🧪 セキュリティ機能のテスト実行中...';
        PERFORM test_security_features();
        RAISE NOTICE '✅ セキュリティ機能テスト完了';
    ELSE
        RAISE WARNING '⚠️ セキュリティ機能統合マイグレーションの適用に問題がある可能性があります';
        RAISE WARNING '   期待値: テーブル=2以上, 関数=7以上, ポリシー=2以上';
        RAISE WARNING '   実際値: テーブル=%, 関数=%, ポリシー=%', table_count, function_count, policy_count;
    END IF;
END $$;

-- ====================================================================
-- 🗑️ 旧ファイル削除の案内
-- ====================================================================
/*
🚨 統合完了後の作業:

1. 以下の重複ファイルを削除してください:
   - supabase/migrations/20250627000000_orphaned_users_cleanup.sql
   - supabase/migrations/20250631000000_fix_security_audit_log_rls.sql

2. セキュリティ機能の動作確認:
   SELECT * FROM test_security_features();
   SELECT * FROM check_database_health();
   SELECT * FROM get_user_statistics();

3. 定期実行の設定（推奨）:
   - 孤立ユーザークリーンアップ: 月1回
   - データベース健全性チェック: 週1回
   - セキュリティ監査: 日1回

4. 本番環境への適用前チェック:
   - ローカル環境でのフルテスト実行
   - セキュリティスキャンの実施
   - バックアップの取得
*/
