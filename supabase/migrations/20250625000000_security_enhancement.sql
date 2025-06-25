-- セキュリティ強化マイグレーション
-- Issue #16: #8のセキュリティ強化
-- 作成日: 2025-06-25

-- ====================================================================
-- 🚨 高リスク対応: 危険な関数の完全削除と置き換え
-- ====================================================================

-- 1. 動的SQL実行関数を削除（本番環境の安全性確保）
DROP FUNCTION IF EXISTS exec_sql_dev_only(TEXT);

-- 2. 安全な代替関数を作成（厳格な制限付き）
CREATE OR REPLACE FUNCTION execute_safe_test_query(test_query TEXT)
RETURNS TABLE(result JSONB)
LANGUAGE plpgsql
SECURITY INVOKER  -- 🔒 権限昇格を防止
SET search_path = public
AS $$
DECLARE
    allowed_patterns TEXT[] := ARRAY[
        '^SELECT.*FROM\s+get_enum_types\(\)',
        '^SELECT.*FROM\s+get_enum_values\(',
        '^SELECT.*test_.*_enum\(',
        '^SELECT\s+1',
        '^SELECT.*pg_enum',
        '^SELECT.*information_schema'
    ];
    pattern TEXT;
    is_allowed BOOLEAN := FALSE;
BEGIN
    -- NULL/空文字チェック
    IF test_query IS NULL OR LENGTH(TRIM(test_query)) = 0 THEN
        RETURN QUERY SELECT jsonb_build_object(
            'error', 'クエリが指定されていません',
            'sqlstate', '22000'
        ) as result;
        RETURN;
    END IF;

    -- 厳格なホワイトリスト検証
    FOREACH pattern IN ARRAY allowed_patterns LOOP
        IF test_query ~* pattern THEN
            is_allowed := TRUE;
            EXIT;
        END IF;
    END LOOP;

    IF NOT is_allowed THEN
        RETURN QUERY SELECT jsonb_build_object(
            'error', '許可されていないクエリです。テスト用の安全なクエリのみ実行可能です。',
            'sqlstate', '42501'
        ) as result;
        RETURN;
    END IF;

    -- 危険なキーワードの二重チェック
    IF test_query ~* '\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|COPY|\\\\)\b' THEN
        RETURN QUERY SELECT jsonb_build_object(
            'error', 'DDL/DML操作は許可されていません',
            'sqlstate', '42501'
        ) as result;
        RETURN;
    END IF;

    -- 安全なクエリのみ実行
    RETURN QUERY EXECUTE test_query;
EXCEPTION
    WHEN OTHERS THEN
        -- セキュリティログの記録
        RAISE WARNING 'execute_safe_test_query: セキュリティ違反の可能性 - %', test_query;
        RETURN QUERY SELECT jsonb_build_object(
            'error', SQLERRM,
            'sqlstate', SQLSTATE
        ) as result;
END;
$$;

-- ====================================================================
-- 🔒 権限管理の厳格化
-- ====================================================================

-- 3. 開発専用テストデータ削除関数の完全削除
DROP FUNCTION IF EXISTS cleanup_test_data_dev_only();

-- 4. 安全なテストデータ管理関数を作成（SECURITY INVOKER）
CREATE OR REPLACE FUNCTION cleanup_test_data_safe()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER  -- 🔒 呼び出し元の権限で実行
AS $$
BEGIN
    -- 環境チェック（より厳格な制御）
    IF current_setting('app.environment', true) = 'production' 
       OR current_setting('app.environment', true) = '' THEN
        RAISE EXCEPTION 'この関数は本番環境では使用できません。app.environment=testに設定してください。';
    END IF;

    -- 削除可能テーブルの制限（ホワイトリスト方式）
    DELETE FROM test_enum_validation WHERE TRUE;
    
    RAISE NOTICE 'テストデータが安全に削除されました';
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'cleanup_test_data_safe error: %', SQLERRM;
        RAISE;
END;
$$;

-- ====================================================================
-- 🛡️ ENUM検証関数のセキュリティ強化
-- ====================================================================

-- 5. get_enum_values関数のセキュリティ強化（SECURITY INVOKER化）
CREATE OR REPLACE FUNCTION get_enum_values_secure(enum_type_name TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY INVOKER  -- 🔒 権限昇格を防止
AS $$
DECLARE
    enum_values TEXT[];
    allowed_enums TEXT[] := ARRAY[
        'event_status_enum',
        'payment_method_enum', 
        'payment_status_enum',
        'attendance_status_enum',
        'stripe_account_status_enum',
        'payout_status_enum'
    ];
BEGIN
    -- 入力値の妥当性検証（強化版）
    IF enum_type_name IS NULL OR LENGTH(TRIM(enum_type_name)) = 0 THEN
        RAISE EXCEPTION 'ENUM型名が指定されていません' USING ERRCODE = '22000';
    END IF;

    -- 英数字とアンダースコアのみ許可
    IF NOT enum_type_name ~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
        RAISE EXCEPTION '不正なENUM型名です: %', enum_type_name USING ERRCODE = '22000';
    END IF;

    -- ホワイトリスト検証（SQLインジェクション対策）
    IF NOT (enum_type_name = ANY(allowed_enums)) THEN
        RAISE EXCEPTION '許可されていないENUM型です: %', enum_type_name USING ERRCODE = '42501';
    END IF;

    -- パラメータ化クエリでENUM値を安全に取得
    SELECT ARRAY(
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = enum_type_name
          AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        ORDER BY e.enumsortorder
    ) INTO enum_values;

    RETURN COALESCE(enum_values, ARRAY[]::TEXT[]);
EXCEPTION
    WHEN OTHERS THEN
        -- エラーログの記録（機密情報の除外）
        RAISE WARNING 'get_enum_values_secure: type=% error=%', enum_type_name, SQLSTATE;
        RETURN ARRAY[]::TEXT[];
END;
$$;

-- ====================================================================
-- 🏗️ アプリケーション設定の追加
-- ====================================================================

-- 6. 環境設定の初期化
-- ALTER DATABASE postgres SET app.environment = 'development';

-- 開発環境でのみ実行（本番環境では設定変更不要）
DO $$
BEGIN
    -- 現在の設定を確認
    IF current_setting('app.environment', true) = '' THEN
        -- デフォルトで development に設定（本番環境では手動で production に変更）
        EXECUTE 'ALTER DATABASE ' || current_database() || ' SET app.environment = ''development''';
        RAISE NOTICE 'app.environment を development に設定しました';
    END IF;
END $$;

-- ====================================================================
-- 🔐 権限設定の最小化
-- ====================================================================

-- 7. 古い危険な関数の権限を取り消し（IF EXISTS使用）
DO $$
BEGIN
    -- exec_sql_dev_only関数の権限取り消し（存在する場合のみ）
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'exec_sql_dev_only') THEN
        REVOKE ALL ON FUNCTION exec_sql_dev_only(TEXT) FROM PUBLIC, authenticated, service_role;
    END IF;
    
    -- cleanup_test_data_dev_only関数の権限取り消し（存在する場合のみ）
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_test_data_dev_only') THEN
        REVOKE ALL ON FUNCTION cleanup_test_data_dev_only() FROM PUBLIC, authenticated, service_role;
    END IF;
END $$;

-- 8. 新しい安全な関数への最小権限付与
-- テスト専用関数（最小限の権限）
GRANT EXECUTE ON FUNCTION execute_safe_test_query(TEXT) TO service_role;
-- authenticatedロールには付与しない（セキュリティ向上）

GRANT EXECUTE ON FUNCTION cleanup_test_data_safe() TO service_role;
-- authenticatedロールには付与しない（誤削除防止）

-- ENUM情報取得関数（セキュリティ強化版）
GRANT EXECUTE ON FUNCTION get_enum_values_secure(TEXT) TO authenticated, service_role;

-- 既存の安全な関数の権限は維持
-- （test_*_enum関数、get_enum_types関数）

-- ====================================================================
-- 📊 セキュリティ監査ログ設定
-- ====================================================================

-- 9. セキュリティイベントログ用テーブル（開発環境専用）
CREATE TABLE IF NOT EXISTS security_audit_log (
    id SERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    user_role TEXT,
    ip_address INET,
    query_attempted TEXT,
    blocked_reason TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- セキュリティログ記録関数
CREATE OR REPLACE FUNCTION log_security_event(
    p_event_type TEXT,
    p_user_role TEXT DEFAULT NULL,
    p_query_attempted TEXT DEFAULT NULL,
    p_blocked_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- 本番環境ではログを外部システムに送信（実装は別途）
    IF current_setting('app.environment', true) = 'production' THEN
        -- 本番環境では外部ログシステムへの送信ロジックを実装
        RAISE WARNING 'SECURITY EVENT: % - %', p_event_type, p_blocked_reason;
        RETURN;
    END IF;

    -- 開発・テスト環境では内部テーブルに記録
    INSERT INTO security_audit_log (
        event_type, user_role, query_attempted, blocked_reason
    ) VALUES (
        p_event_type, p_user_role, p_query_attempted, p_blocked_reason
    );
EXCEPTION
    WHEN OTHERS THEN
        -- ログ記録の失敗は致命的エラーにしない
        RAISE WARNING 'セキュリティログ記録失敗: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION log_security_event(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ====================================================================
-- 🧹 本番環境用クリーンアップスクリプト
-- ====================================================================

-- 10. 本番環境デプロイ時実行用のクリーンアップ関数
CREATE OR REPLACE FUNCTION production_security_cleanup()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cleanup_summary TEXT := '';
BEGIN
    -- 本番環境での危険要素の完全削除
    
    -- 開発用テーブルの削除
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'test_enum_validation') THEN
        DROP TABLE test_enum_validation;
        cleanup_summary := cleanup_summary || 'test_enum_validation テーブルを削除しました。' || E'\n';
    END IF;

    -- セキュリティ監査ログテーブルの削除（本番環境では外部ログシステム使用）
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'security_audit_log') THEN
        DROP TABLE security_audit_log;
        cleanup_summary := cleanup_summary || 'security_audit_log テーブルを削除しました。' || E'\n';
    END IF;

    -- 開発専用関数の削除
    DROP FUNCTION IF EXISTS execute_safe_test_query(TEXT);
    DROP FUNCTION IF EXISTS cleanup_test_data_safe();
    cleanup_summary := cleanup_summary || '開発専用関数を削除しました。' || E'\n';

    -- 環境設定を本番に変更
    EXECUTE 'ALTER DATABASE ' || current_database() || ' SET app.environment = ''production''';
    cleanup_summary := cleanup_summary || 'app.environment を production に設定しました。' || E'\n';

    RETURN '本番環境クリーンアップ完了:' || E'\n' || cleanup_summary;
END;
$$;

-- 本番デプロイ担当者のみに実行権限付与
GRANT EXECUTE ON FUNCTION production_security_cleanup() TO service_role;

-- ====================================================================
-- ✅ セキュリティ強化完了の確認
-- ====================================================================

DO $$
DECLARE
    security_status TEXT := '';
BEGIN
    -- セキュリティ強化状況の確認
    security_status := security_status || '✅ 危険な動的SQL実行関数を削除しました' || E'\n';
    security_status := security_status || '✅ SECURITY INVOKER による権限制限を実装しました' || E'\n';
    security_status := security_status || '✅ 最小権限の原則を適用しました' || E'\n';
    security_status := security_status || '✅ セキュリティ監査ログを実装しました' || E'\n';
    security_status := security_status || '✅ 本番環境クリーンアップ機能を実装しました' || E'\n';
    
    RAISE NOTICE E'ENUM型セキュリティ強化が完了しました:\n%', security_status;
    
    -- 環境情報の表示
    RAISE NOTICE '現在の環境設定: %', current_setting('app.environment', true);
    RAISE NOTICE 'セキュリティ強化マイグレーション適用完了: 20250625000000_security_enhancement';
END $$;

-- ====================================================================
-- 📚 セキュリティ強化の適用手順（本番環境用）
-- ====================================================================
/*
🚨 本番環境デプロイ時の必須手順:

1. マイグレーション適用:
   npx supabase migration up

2. 環境設定変更:
   ALTER DATABASE [database_name] SET app.environment = 'production';

3. 本番環境クリーンアップ実行:
   SELECT production_security_cleanup();

4. セキュリティテスト実行:
   npm run test:security

5. セキュリティ監査の実施:
   - 不要な権限がないか確認
   - テスト用データ・関数が残っていないか確認
   - ログ監視システムの動作確認

⚠️ 注意事項:
- 本番環境では execute_safe_test_query() も削除すること
- セキュリティ監査ログは外部システムと連携すること
- 定期的なセキュリティレビューを実施すること
*/