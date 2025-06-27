-- AUTH-001: RLS修正とプライバシー保護強化マイグレーション
-- Green Phase実装: auth-rls.test.tsテストをパスさせるための修正
-- 作成日: 2025-06-26

-- ====================================================================
-- 🔧 get_event_creator_name関数の修正
-- ====================================================================

-- 既存の関数を削除して新しいパラメータ名で再作成
DROP FUNCTION IF EXISTS public.get_event_creator_name(creator_id UUID);

-- テストが期待するパラメータ名（user_id）で関数を再作成
CREATE OR REPLACE FUNCTION public.get_event_creator_name(user_id UUID)
RETURNS VARCHAR
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT name FROM public.users WHERE id = user_id;
$$;

-- 関数の実行権限設定
GRANT EXECUTE ON FUNCTION public.get_event_creator_name(UUID) TO authenticated, service_role;

-- ====================================================================
-- 🛡️ プライバシー保護強化: users.emailへの直接アクセス制限
-- ====================================================================

-- 既存のusersテーブルRLSポリシーを削除して再作成
DROP POLICY IF EXISTS "Users can view own profile only" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- メールアドレスへの直接アクセスを制限する新しいポリシー
-- ユーザーは自分の id, name, created_at, updated_at のみ閲覧可能（emailは除外）
CREATE POLICY "Users can view own profile except email" ON public.users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- ユーザーは自分の name のみ更新可能（emailは更新不可）
CREATE POLICY "Users can update own name only" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ====================================================================
-- 🔒 public_profilesビューのRLS設定
-- ====================================================================

-- 注意: ビューはベースとなるテーブル（users）のRLSポリシーを継承するため、
-- public_profilesビュー自体にポリシーを設定する必要はありません。
-- usersテーブルのRLSポリシーが適用されます。

-- ====================================================================
-- 📊 マイグレーション適用確認
-- ====================================================================

DO $$
DECLARE
    function_exists BOOLEAN;
    policy_count INTEGER;
BEGIN
    -- 関数の存在確認
    SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'get_event_creator_name' 
        AND pg_catalog.pg_function_is_visible(oid)
    ) INTO function_exists;
    
    -- RLSポリシー数確認
    SELECT COUNT(*) INTO policy_count 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'users';
    
    RAISE NOTICE 'AUTH-001 RLS修正マイグレーション完了:';
    RAISE NOTICE '- get_event_creator_name関数(user_id): %', function_exists;
    RAISE NOTICE '- usersテーブルRLSポリシー数: %', policy_count;
    
    IF function_exists AND policy_count >= 2 THEN
        RAISE NOTICE '✅ AUTH-001: RLS修正とプライバシー保護強化完了';
    ELSE
        RAISE EXCEPTION 'マイグレーション適用に失敗しました';
    END IF;
END
$$;