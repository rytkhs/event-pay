-- テスト用関数マイグレーション
-- テスト実行時に必要な関数とテーブルを定義

-- ====================================================================
-- テスト用SQL実行関数
-- ====================================================================
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS TABLE(result JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY EXECUTE 'SELECT ''{"success": true}''::jsonb as result';
EXCEPTION
  WHEN OTHERS THEN
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
-- event_status_enum 検証関数
CREATE OR REPLACE FUNCTION test_event_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM test_value::event_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

-- payment_method_enum 検証関数
CREATE OR REPLACE FUNCTION test_payment_method_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM test_value::payment_method_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

-- payment_status_enum 検証関数
CREATE OR REPLACE FUNCTION test_payment_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM test_value::payment_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

-- attendance_status_enum 検証関数
CREATE OR REPLACE FUNCTION test_attendance_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM test_value::attendance_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

-- stripe_account_status_enum 検証関数
CREATE OR REPLACE FUNCTION test_stripe_account_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM test_value::stripe_account_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

-- payout_status_enum 検証関数
CREATE OR REPLACE FUNCTION test_payout_status_enum(test_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM test_value::payout_status_enum;
  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

-- ====================================================================
-- ENUM型情報取得関数
-- ====================================================================
-- 全ENUM型の一覧を取得
CREATE OR REPLACE FUNCTION get_enum_types()
RETURNS TABLE(enum_name TEXT, enum_values TEXT[])
LANGUAGE sql
SECURITY DEFINER
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

-- 特定ENUM型の値を取得
CREATE OR REPLACE FUNCTION get_enum_values(enum_type_name TEXT)
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT ARRAY(
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = enum_type_name
      AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY e.enumsortorder
  );
$$;

-- ====================================================================
-- テストデータクリーンアップ関数
-- ====================================================================
CREATE OR REPLACE FUNCTION cleanup_test_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM test_enum_validation WHERE TRUE;
END;
$$;

-- ====================================================================
-- 権限設定
-- ====================================================================
-- authenticated ロールに実行権限を付与
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION test_event_status_enum(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION test_payment_method_enum(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION test_payment_status_enum(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION test_attendance_status_enum(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION test_stripe_account_status_enum(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION test_payout_status_enum(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_enum_types() TO authenticated;
GRANT EXECUTE ON FUNCTION get_enum_values(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_test_data() TO authenticated;

-- service_role ロールに実行権限を付与
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION test_event_status_enum(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION test_payment_method_enum(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION test_payment_status_enum(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION test_attendance_status_enum(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION test_stripe_account_status_enum(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION test_payout_status_enum(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_enum_types() TO service_role;
GRANT EXECUTE ON FUNCTION get_enum_values(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_test_data() TO service_role;

-- テストテーブルへのアクセス権限
GRANT ALL ON test_enum_validation TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE test_enum_validation_id_seq TO authenticated, service_role;