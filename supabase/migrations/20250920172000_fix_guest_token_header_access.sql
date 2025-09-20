-- Fix guest token header access in get_guest_token() function
-- カスタムヘッダーへのアクセス方法を正しい形式に修正

CREATE OR REPLACE FUNCTION "public"."get_guest_token"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  token TEXT;
BEGIN
  -- 1. JWTクレームから取得（推奨、将来実装）
  BEGIN
    SELECT (current_setting('request.jwt.claims', true)::json->>'guest_token') INTO token;
    IF token IS NOT NULL AND token != '' THEN
      RETURN token;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- 続行
  END;

  -- 2. カスタムヘッダーから取得（現在の実装）
  -- 正しい形式: current_setting('request.headers', true)::json->>'header-name'
  BEGIN
    SELECT current_setting('request.headers', true)::json->>'x-guest-token' INTO token;
    IF token IS NOT NULL AND token != '' THEN
      RETURN token;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- 続行
  END;

  -- 3. アプリケーション設定から取得（テスト用）
  BEGIN
    SELECT current_setting('app.guest_token', true) INTO token;
    IF token IS NOT NULL AND token != '' THEN
      RETURN token;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- 続行
  END;

  -- 4. テスト用の直接設定（テスト環境専用）
  BEGIN
    SELECT current_setting('test.guest_token', true) INTO token;
    IF token IS NOT NULL AND token != '' THEN
      RETURN token;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- 続行
  END;

  -- すべて失敗した場合はNULLを返す
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION "public"."get_guest_token"() IS 'ゲストトークンを複数の方法（JWTクレーム、ヘッダー、設定）から取得するヘルパー関数。フォールバック機能付き。正しいヘッダーアクセス形式を使用。';
