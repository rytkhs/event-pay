-- テスト用関数マイグレーション
-- テスト実行時に必要な関数とテーブルを定義

-- ====================================================================
-- テスト用SQL実行関数
-- ====================================================================
-- ====================================================================
-- ⚠️ DEVELOPMENT/TEST ENVIRONMENT ONLY FUNCTIONS
-- 本番環境では以下の関数群を削除またはアクセス制限すること
-- ====================================================================

-- 🚨 危険: 動的SQL実行関数 - 開発・テスト環境専用
-- 本番環境では削除推奨（SQLインジェクション攻撃のリスク）
-- 使用条件: ローカル開発またはテスト環境でのみ有効化
CREATE OR REPLACE FUNCTION exec_sql_dev_only(sql TEXT)
RETURNS TABLE(result JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 環境チェック（本番環境での実行を阻止）
  IF current_setting('app.environment', true) = 'production' THEN
    RETURN QUERY SELECT jsonb_build_object(
      'error', 'この関数は本番環境では使用できません',
      'sqlstate', '42501'
    ) as result;
  END IF;

  -- 厳格なSQLインジェクション対策
  IF sql ~* '\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|GRANT|REVOKE|TRUNCATE)\b' THEN
    RETURN QUERY SELECT jsonb_build_object(
      'error', 'DDL/DML operations are not allowed in exec_sql function',
      'sqlstate', '42501'
    ) as result;
  END IF;

  -- SELECT文かつ特定テーブルのみ許可
  IF NOT sql ~* '^\s*SELECT\b.*\bFROM\s+(test_|pg_|information_schema\.)' THEN
    RETURN QUERY SELECT jsonb_build_object(
      'error', 'テスト用テーブルまたはシステムテーブルのSELECT文のみ許可',
      'sqlstate', '42501'
    ) as result;
  END IF;

  -- 制限された範囲でのみSQL実行を許可
  RETURN QUERY EXECUTE sql;
EXCEPTION
  WHEN OTHERS THEN
    -- セキュリティログの記録
    RAISE WARNING 'exec_sql_dev_only security violation: %', sql;
    RETURN QUERY SELECT jsonb_build_object(
      'error', SQLERRM,
      'sqlstate', SQLSTATE
    ) as result;
END;
$$;

-- ====================================================================
-- ENUM型テスト用テンポラリテーブル
-- ====================================================================
CREATE TABLE IF NOT EXISTS test_enum_validation (
  id SERIAL PRIMARY KEY,
  event_status event_status_enum,
  payment_method payment_method_enum,
  payment_status payment_status_enum,
  attendance_status attendance_status_enum,
  stripe_account_status stripe_account_status_enum,
  payout_status payout_status_enum,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ====================================================================
-- ENUM型値検証用関数
-- ====================================================================
-- event_status_enum 検証関数（安全な読み取り専用）
CREATE OR REPLACE FUNCTION test_event_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER -- 呼び出し元の権限で実行（権限昇格なし）
AS $$
BEGIN
  -- 入力値の妥当性検証
  IF test_value IS NULL THEN
    RETURN FALSE;
  END IF;

  -- ENUM型へのキャスト試行
  PERFORM test_value::event_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
  WHEN OTHERS THEN
    -- 予期しないエラーをログに記録
    RAISE WARNING 'test_event_status_enum unexpected error for value %: %', test_value, SQLERRM;
    RETURN FALSE;
END;
$$;

-- payment_method_enum 検証関数（安全な読み取り専用）
CREATE OR REPLACE FUNCTION test_payment_method_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF test_value IS NULL THEN
    RETURN FALSE;
  END IF;
  PERFORM test_value::payment_method_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
  WHEN OTHERS THEN
    RAISE WARNING 'test_payment_method_enum unexpected error for value %: %', test_value, SQLERRM;
    RETURN FALSE;
END;
$$;

-- payment_status_enum 検証関数（安全な読み取り専用）
CREATE OR REPLACE FUNCTION test_payment_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF test_value IS NULL THEN
    RETURN FALSE;
  END IF;
  PERFORM test_value::payment_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
  WHEN OTHERS THEN
    RAISE WARNING 'test_payment_status_enum unexpected error for value %: %', test_value, SQLERRM;
    RETURN FALSE;
END;
$$;

-- attendance_status_enum 検証関数（安全な読み取り専用）
CREATE OR REPLACE FUNCTION test_attendance_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF test_value IS NULL THEN
    RETURN FALSE;
  END IF;
  PERFORM test_value::attendance_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
  WHEN OTHERS THEN
    RAISE WARNING 'test_attendance_status_enum unexpected error for value %: %', test_value, SQLERRM;
    RETURN FALSE;
END;
$$;

-- stripe_account_status_enum 検証関数（安全な読み取り専用）
CREATE OR REPLACE FUNCTION test_stripe_account_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF test_value IS NULL THEN
    RETURN FALSE;
  END IF;
  PERFORM test_value::stripe_account_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
  WHEN OTHERS THEN
    RAISE WARNING 'test_stripe_account_status_enum unexpected error for value %: %', test_value, SQLERRM;
    RETURN FALSE;
END;
$$;

-- payout_status_enum 検証関数（安全な読み取り専用）
CREATE OR REPLACE FUNCTION test_payout_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF test_value IS NULL THEN
    RETURN FALSE;
  END IF;
  PERFORM test_value::payout_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
  WHEN OTHERS THEN
    RAISE WARNING 'test_payout_status_enum unexpected error for value %: %', test_value, SQLERRM;
    RETURN FALSE;
END;
$$;

-- ====================================================================
-- ENUM型情報取得関数
-- ====================================================================
-- 全ENUM型の一覧を取得（安全な読み取り専用）
CREATE OR REPLACE FUNCTION get_enum_types()
RETURNS TABLE(enum_name TEXT, enum_values TEXT[])
LANGUAGE sql
SECURITY INVOKER -- システムテーブルの読み取りのみ、権限昇格不要
AS $$
  SELECT
    t.typname::TEXT as enum_name,
    ARRAY(
      SELECT e.enumlabel
      FROM pg_enum e
      WHERE e.enumtypid = t.oid
      ORDER BY e.enumsortorder
    ) as enum_values
  FROM pg_type t
  WHERE t.typtype = 'e'
    AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND t.typname LIKE '%_enum'
  ORDER BY t.typname;
$$;

-- 特定ENUM型の値を取得（セキュリティ強化版）
CREATE OR REPLACE FUNCTION get_enum_values(enum_type_name TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
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
    -- 入力値の妥当性検証
    IF enum_type_name IS NULL OR LENGTH(TRIM(enum_type_name)) = 0 THEN
        RAISE EXCEPTION 'ENUM型名が指定されていません';
    END IF;

    -- ホワイトリスト検証（SQLインジェクション対策）
    IF NOT (enum_type_name = ANY(allowed_enums)) THEN
        RAISE EXCEPTION '許可されていないENUM型です: %', enum_type_name;
    END IF;

    -- 安全なパラメータ化クエリでENUM値を取得
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
        -- エラーログの記録（本番環境では外部ログシステムに送信）
        RAISE WARNING 'get_enum_values error for type %: %', enum_type_name, SQLERRM;
        RETURN ARRAY[]::TEXT[];
END;
$$;

-- ====================================================================
-- テストデータクリーンアップ関数（開発・テスト環境専用）
-- ====================================================================
-- 🚨 危険: 全件削除関数 - 開発・テスト環境専用
CREATE OR REPLACE FUNCTION cleanup_test_data_dev_only()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 環境チェック（本番環境での実行を阻止）
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE EXCEPTION 'この関数は本番環境では使用できません';
  END IF;

  -- テストテーブルのみを対象とした安全な削除
  DELETE FROM test_enum_validation WHERE TRUE;

  -- ログ記録
  RAISE NOTICE 'テストデータが削除されました: test_enum_validation';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'cleanup_test_data_dev_only error: %', SQLERRM;
    RAISE;
END;
$$;

-- ====================================================================
-- 権限設定（セキュリティ強化版）
-- ====================================================================

-- 🔒 安全な関数への権限付与（本番環境でも使用可能）
-- ENUM検証関数（読み取り専用、安全）
GRANT EXECUTE ON FUNCTION test_event_status_enum(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION test_payment_method_enum(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION test_payment_status_enum(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION test_attendance_status_enum(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION test_stripe_account_status_enum(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION test_payout_status_enum(TEXT) TO authenticated, service_role;

-- ENUM情報取得関数（読み取り専用、セキュリティ強化済み）
GRANT EXECUTE ON FUNCTION get_enum_types() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_enum_values(TEXT) TO authenticated, service_role;

-- ⚠️ 制限付き権限（開発・テスト環境専用）
-- 以下の関数は本番環境では削除またはアクセス禁止とすること

-- 開発環境専用: 動的SQL実行関数（極めて制限的）
-- 本番環境では以下の権限を削除すること
GRANT EXECUTE ON FUNCTION exec_sql_dev_only(TEXT) TO service_role;
-- authenticated ロールには付与しない（セキュリティ向上）

-- 開発環境専用: テストデータ削除関数
-- 本番環境では以下の権限を削除すること
GRANT EXECUTE ON FUNCTION cleanup_test_data_dev_only() TO service_role;
-- authenticated ロールには付与しない（誤削除防止）

-- テストテーブルへのアクセス権限（開発・テスト環境専用）
-- 本番環境ではテーブル自体を削除すること
GRANT ALL ON test_enum_validation TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE test_enum_validation_id_seq TO authenticated, service_role;

-- ====================================================================
-- 本番環境デプロイ時の注意事項
-- ====================================================================
/*
🚨 本番環境デプロイ前に以下の対応を実施すること:

1. 危険な関数の削除:
   DROP FUNCTION IF EXISTS exec_sql_dev_only(TEXT);
   DROP FUNCTION IF EXISTS cleanup_test_data_dev_only();

2. テストテーブルの削除:
   DROP TABLE IF EXISTS test_enum_validation;
   DROP SEQUENCE IF EXISTS test_enum_validation_id_seq;

3. 環境変数の設定:
   app.environment = 'production'

4. 不要な権限の取り消し:
   本番環境では必要最小限の権限のみを付与
*/
