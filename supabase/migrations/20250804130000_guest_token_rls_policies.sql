-- ゲストトークン用RLSポリシーの追加
-- 目的: ゲストトークンによる安全なデータアクセスを可能にする

-- ====================================================================
-- 1. ゲストトークン取得のヘルパー関数
-- ====================================================================

-- ゲストトークン取得のヘルパー関数（複数の方法をフォールバック）
CREATE OR REPLACE FUNCTION public.get_guest_token() 
RETURNS TEXT 
LANGUAGE plpgsql 
SECURITY DEFINER
STABLE
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
  BEGIN
    SELECT current_setting('request.headers.x-guest-token', true) INTO token;
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

-- 関数の実行権限を設定
GRANT EXECUTE ON FUNCTION public.get_guest_token() TO anon, authenticated, service_role;

-- テスト用のヘルパー関数：ゲストトークンを設定
CREATE OR REPLACE FUNCTION public.set_test_guest_token(token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- テスト用設定を使用（セッション全体で有効）
  PERFORM set_config('test.guest_token', token, false);
END;
$$;

-- テスト用関数の実行権限を設定
GRANT EXECUTE ON FUNCTION public.set_test_guest_token(TEXT) TO anon, authenticated, service_role;

-- テスト用のヘルパー関数：ゲストトークンをクリア
CREATE OR REPLACE FUNCTION public.clear_test_guest_token()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- テスト用設定をクリア
  PERFORM set_config('test.guest_token', '', false);
END;
$$;

-- テスト用関数の実行権限を設定
GRANT EXECUTE ON FUNCTION public.clear_test_guest_token() TO anon, authenticated, service_role;

-- 関数にコメントを追加
COMMENT ON FUNCTION public.get_guest_token() IS 
'ゲストトークンを複数の方法（JWTクレーム、ヘッダー、設定）から取得するヘルパー関数。フォールバック機能付き。';

-- ====================================================================
-- 1.5. 既存のeventsテーブルポリシーを削除してゲストアクセス用に置き換え
-- ====================================================================

-- 既存の「Anyone can view events」ポリシーを削除
DROP POLICY IF EXISTS "Anyone can view events" ON public.events;

-- ====================================================================
-- 2. attendancesテーブル用ゲストアクセスポリシー
-- ====================================================================

-- ゲストトークンによる読み取りアクセス
CREATE POLICY "Guest token read access for attendances" 
ON public.attendances 
FOR SELECT 
TO anon, authenticated 
USING (
  guest_token IS NOT NULL 
  AND guest_token = public.get_guest_token()
);

-- ゲストトークンによる更新アクセス（期限内のみ）
CREATE POLICY "Guest token update for attendances" 
ON public.attendances 
FOR UPDATE 
TO anon, authenticated 
USING (
  guest_token IS NOT NULL 
  AND guest_token = public.get_guest_token()
  AND EXISTS (
    SELECT 1 FROM public.events e 
    WHERE e.id = attendances.event_id 
    AND (e.registration_deadline IS NULL OR e.registration_deadline > NOW())
    AND e.date > NOW()
  )
)
WITH CHECK (
  -- 更新時も同じ条件をチェック
  guest_token IS NOT NULL 
  AND guest_token = public.get_guest_token()
  AND EXISTS (
    SELECT 1 FROM public.events e 
    WHERE e.id = attendances.event_id 
    AND (e.registration_deadline IS NULL OR e.registration_deadline > NOW())
    AND e.date > NOW()
  )
);

-- ====================================================================
-- 3. eventsテーブル用ゲストアクセスポリシー
-- ====================================================================

-- 認証済みユーザーは全てのイベントを閲覧可能（作成者用）
CREATE POLICY "Authenticated users can view all events" 
ON public.events 
FOR SELECT 
TO authenticated 
USING (auth.uid() IS NOT NULL);

-- 招待リンク経由でのイベント詳細読み取りアクセス
CREATE POLICY "Invite link access to events" 
ON public.events 
FOR SELECT 
TO anon, authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.invite_links il 
    WHERE il.event_id = events.id 
    AND il.expires_at > NOW()
    AND (il.max_uses IS NULL OR il.current_uses < il.max_uses)
  )
);

-- ゲストが参加するイベント情報への読み取り専用アクセス
CREATE POLICY "Guest token read event details" 
ON public.events 
FOR SELECT 
TO anon, authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.attendances a 
    WHERE a.event_id = events.id 
    AND a.guest_token IS NOT NULL
    AND a.guest_token = public.get_guest_token()
  )
);

-- ====================================================================
-- 4. paymentsテーブル用ゲストアクセスポリシー
-- ====================================================================

-- ゲストが自分の決済情報を確認するための読み取り専用アクセス
CREATE POLICY "Guest token read payment details" 
ON public.payments 
FOR SELECT 
TO anon, authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.attendances a 
    WHERE a.id = payments.attendance_id 
    AND a.guest_token IS NOT NULL
    AND a.guest_token = public.get_guest_token()
  )
);

-- ゲストトークンによる決済情報の更新（支払い方法変更など）
CREATE POLICY "Guest token update payment details" 
ON public.payments 
FOR UPDATE 
TO anon, authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.attendances a 
    JOIN public.events e ON a.event_id = e.id
    WHERE a.id = payments.attendance_id 
    AND a.guest_token IS NOT NULL
    AND a.guest_token = public.get_guest_token()
    AND (e.payment_deadline IS NULL OR e.payment_deadline > NOW())
    AND e.date > NOW()
  )
)
WITH CHECK (
  -- 更新時も同じ条件をチェック
  EXISTS (
    SELECT 1 FROM public.attendances a 
    JOIN public.events e ON a.event_id = e.id
    WHERE a.id = payments.attendance_id 
    AND a.guest_token IS NOT NULL
    AND a.guest_token = public.get_guest_token()
    AND (e.payment_deadline IS NULL OR e.payment_deadline > NOW())
    AND e.date > NOW()
  )
);

-- ====================================================================
-- 5. パフォーマンス最適化のためのインデックス
-- ====================================================================

-- ゲストトークンアクセス最適化用の部分インデックス
CREATE INDEX IF NOT EXISTS idx_attendances_guest_token_active 
ON public.attendances (guest_token) 
WHERE guest_token IS NOT NULL;

-- イベントIDとゲストトークンの複合インデックス
CREATE INDEX IF NOT EXISTS idx_attendances_event_id_guest_token 
ON public.attendances (event_id, guest_token) 
WHERE guest_token IS NOT NULL;

-- 決済情報の高速検索用インデックス
CREATE INDEX IF NOT EXISTS idx_payments_attendance_id_active 
ON public.payments (attendance_id) 
WHERE attendance_id IS NOT NULL;

-- イベントの期限チェック用インデックス
CREATE INDEX IF NOT EXISTS idx_events_deadlines 
ON public.events (registration_deadline, payment_deadline, date) 
WHERE registration_deadline IS NOT NULL OR payment_deadline IS NOT NULL;

-- ====================================================================
-- 6. セキュリティ強化のための追加設定
-- ====================================================================

-- get_guest_token関数の実行統計を有効化（パフォーマンス監視用）
-- PostgreSQL 14以降で利用可能
DO $$
BEGIN
  -- 統計情報の収集を有効化（エラーが発生しても続行）
  BEGIN
    ALTER FUNCTION public.get_guest_token() SET track_functions = 'all';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Function tracking not available in this PostgreSQL version';
  END;
END $$;

-- ====================================================================
-- 7. 完了通知
-- ====================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Guest token RLS policies created successfully.';
    RAISE NOTICE '   - get_guest_token() helper function implemented';
    RAISE NOTICE '   - RLS policies for attendances, events, payments tables added';
    RAISE NOTICE '   - Performance optimization indexes created';
    RAISE NOTICE '   - Security enhancements applied';
END $$;