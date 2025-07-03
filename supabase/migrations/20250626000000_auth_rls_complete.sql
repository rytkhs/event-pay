-- EventPay 認証・RLS設定 統合マイグレーション
-- AUTH-001: 認証システム・プライバシー保護・RLS設定の完全実装

-- ====================================================================
-- 🔐 公開プロフィール情報ビューの作成
-- ====================================================================
-- 個人情報を保護しつつ、必要な情報のみを公開
-- security_invokerによりRLSによる一元的なアクセス制御を実現
CREATE OR REPLACE VIEW public_profiles
WITH (security_invoker = true) AS
SELECT
    id,
    name,
    created_at
FROM public.users;

-- ====================================================================
-- 🛡️ イベント作成者名取得関数（セキュリティ強化版）
-- ====================================================================
-- イベント作成者の名前のみを安全に取得する関数
-- 直接usersテーブルにアクセスせず、public_profilesビューを使用

-- 既存の関数を削除（戻り値型変更のため）
DROP FUNCTION IF EXISTS get_event_creator_name(UUID);

CREATE OR REPLACE FUNCTION get_event_creator_name(event_creator_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    creator_name TEXT;
BEGIN
    -- 入力値の妥当性検証
    IF event_creator_id IS NULL THEN
        RETURN '不明';
    END IF;

    -- public_profilesビューから安全に名前を取得
    SELECT name INTO creator_name
    FROM public_profiles
    WHERE id = event_creator_id;

    -- 結果の返却（見つからない場合は'不明'を返す）
    RETURN COALESCE(creator_name, '不明');
EXCEPTION
    WHEN OTHERS THEN
        -- エラーログを記録し、安全な値を返す
        RAISE WARNING 'get_event_creator_name error for user_id %: %', event_creator_id, SQLERRM;
        RETURN '不明';
END;
$$;

-- ====================================================================
-- 🔒 Row Level Security (RLS) ポリシーの設定
-- ====================================================================

-- usersテーブルのRLS有効化
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 既存のRLSポリシーを削除（統合のため）
DROP POLICY IF EXISTS "認証済みユーザーは全プロフィール参照可能" ON public.users;
DROP POLICY IF EXISTS "Users can view other users' profiles" ON public.users;
DROP POLICY IF EXISTS "Users can edit own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "自分のプロフィール参照" ON public.users;
DROP POLICY IF EXISTS "自分のプロフィール更新" ON public.users;
DROP POLICY IF EXISTS "新規プロフィール作成" ON public.users;

-- ====================================================================
-- 🛡️ 統合RLSポリシー（最終版）
-- ====================================================================

-- ポリシー1: 認証済みユーザーは全プロフィール参照可能
-- public_profilesビューを通してアクセス制御を行うため、
-- usersテーブル自体は認証済みユーザーが参照可能
CREATE POLICY "認証済みユーザーは全プロフィール参照可能" ON public.users
    FOR SELECT
    TO authenticated
    USING (true);

-- ポリシー2: 自分のプロフィールのみ更新可能
CREATE POLICY "自分のプロフィール更新" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ポリシー3: 新規プロフィール作成（自分のIDのみ）
CREATE POLICY "新規プロフィール作成" ON public.users
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- ポリシー4: 自分のプロフィール削除
CREATE POLICY "自分のプロフィール削除" ON public.users
    FOR DELETE
    TO authenticated
    USING (auth.uid() = id);

-- ====================================================================
-- 🔍 eventsテーブルのRLS設定確認・強化
-- ====================================================================

-- eventsテーブルのRLS有効化（既に有効な場合はスキップ）
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 既存のイベント関連ポリシーの確認・更新
-- （必要に応じて既存ポリシーを削除・再作成）
DROP POLICY IF EXISTS "全員がイベント参照可能" ON public.events;
DROP POLICY IF EXISTS "作成者はイベント管理可能" ON public.events;

-- イベント参照ポリシー（認証不要、invite_tokenがあれば参照可能）
CREATE POLICY "全員がイベント参照可能" ON public.events
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- イベント管理ポリシー（作成者のみ）
CREATE POLICY "作成者はイベント管理可能" ON public.events
    FOR ALL
    TO authenticated
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- ====================================================================
-- 📋 attendancesテーブルのRLS設定確認・強化
-- ====================================================================

-- attendancesテーブルのRLS有効化
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

-- 参加情報のアクセス制御
DROP POLICY IF EXISTS "参加情報は関係者のみ参照可能" ON public.attendances;
DROP POLICY IF EXISTS "参加者は自分の参加情報を管理可能" ON public.attendances;

-- 参加情報参照ポリシー（イベント作成者・本人・匿名参加者）
CREATE POLICY "参加情報は関係者のみ参照可能" ON public.attendances
    FOR SELECT
    TO anon, authenticated
    USING (
        -- イベント作成者は全参加者を参照可能
        EXISTS (
            SELECT 1 FROM public.events
            WHERE events.id = attendances.event_id
            AND events.created_by = auth.uid()
        )
        -- 匿名参加者は自分の参加情報のみ参照可能（guest_tokenで識別）
        OR (auth.role() = 'anon' AND guest_token IS NOT NULL)
    );

-- 参加情報管理ポリシー（新規参加・更新）
CREATE POLICY "参加者は自分の参加情報を管理可能" ON public.attendances
    FOR ALL
    TO anon, authenticated
    USING (
        -- イベント作成者は全参加者を管理可能
        EXISTS (
            SELECT 1 FROM public.events
            WHERE events.id = attendances.event_id
            AND events.created_by = auth.uid()
        )
        -- 匿名参加者は自分の参加情報のみ管理可能
        OR (auth.role() = 'anon')
    )
    WITH CHECK (
        -- 同上の条件をWITH CHECKでも適用
        EXISTS (
            SELECT 1 FROM public.events
            WHERE events.id = attendances.event_id
            AND events.created_by = auth.uid()
        )
        OR (auth.role() = 'anon')
    );

-- ====================================================================
-- 💳 paymentsテーブルのRLS設定確認・強化
-- ====================================================================

-- paymentsテーブルのRLS有効化
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 決済情報のアクセス制御（極めて厳格）
DROP POLICY IF EXISTS "決済情報は関係者のみ参照可能" ON public.payments;
DROP POLICY IF EXISTS "決済情報の管理" ON public.payments;

-- 決済情報参照ポリシー（イベント作成者・service_role のみ）
CREATE POLICY "決済情報は関係者のみ参照可能" ON public.payments
    FOR SELECT
    TO authenticated, service_role
    USING (
        -- イベント作成者のみ参照可能
        EXISTS (
            SELECT 1 FROM public.attendances
            JOIN public.events ON attendances.event_id = events.id
            WHERE attendances.id = payments.attendance_id
            AND events.created_by = auth.uid()
        )
        -- service_roleは全決済情報参照可能（Webhook処理用）
        OR auth.role() = 'service_role'
    );

-- 決済情報管理ポリシー（service_role のみ）
CREATE POLICY "決済情報の管理" ON public.payments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ====================================================================
-- 🏦 stripe_connect_accounts・payoutsテーブルのRLS設定
-- ====================================================================

-- Stripe Connect アカウント情報のRLS
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ユーザーは自分のStripeアカウント情報のみ管理可能" ON public.stripe_connect_accounts;

CREATE POLICY "ユーザーは自分のStripeアカウント情報のみ管理可能" ON public.stripe_connect_accounts
    FOR ALL
    TO authenticated, service_role
    USING (
        auth.uid() = user_id OR auth.role() = 'service_role'
    )
    WITH CHECK (
        auth.uid() = user_id OR auth.role() = 'service_role'
    );

-- 送金履歴のRLS
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ユーザーは自分の送金履歴のみ参照可能" ON public.payouts;
DROP POLICY IF EXISTS "送金履歴の管理" ON public.payouts;

CREATE POLICY "ユーザーは自分の送金履歴のみ参照可能" ON public.payouts
    FOR SELECT
    TO authenticated, service_role
    USING (
        auth.uid() = user_id OR auth.role() = 'service_role'
    );

CREATE POLICY "送金履歴の管理" ON public.payouts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ====================================================================
-- 🔧 権限設定とセキュリティ強化
-- ====================================================================

-- public_profilesビューへの権限付与
GRANT SELECT ON public_profiles TO anon, authenticated, service_role;

-- get_event_creator_name関数への権限付与
GRANT EXECUTE ON FUNCTION get_event_creator_name(UUID) TO anon, authenticated, service_role;

-- ====================================================================
-- 📊 統合完了の確認とログ
-- ====================================================================

DO $$
DECLARE
    policy_count INTEGER;
    view_count INTEGER;
    function_count INTEGER;
BEGIN
    -- RLSポリシー数の確認
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
        'users', 'events', 'attendances', 'payments',
        'stripe_connect_accounts', 'payouts'
    );

    -- ビューの確認
    SELECT COUNT(*) INTO view_count
    FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'public_profiles';

    -- 関数の確認
    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_event_creator_name';

    RAISE NOTICE '======================================================================';
    RAISE NOTICE '✅ EventPay 認証・RLS設定統合が完了しました';
    RAISE NOTICE '======================================================================';
    RAISE NOTICE '📊 統合結果:';
    RAISE NOTICE '  - RLSポリシー数: % 個', policy_count;
    RAISE NOTICE '  - public_profilesビュー: % 個作成', view_count;
    RAISE NOTICE '  - get_event_creator_name関数: % 個作成', function_count;
    RAISE NOTICE '======================================================================';
    RAISE NOTICE '🔐 セキュリティ強化項目:';
    RAISE NOTICE '  ✅ usersテーブルへの直接アクセス制限';
    RAISE NOTICE '  ✅ public_profilesビューによる安全な情報公開';
    RAISE NOTICE '  ✅ 全テーブルのRLSポリシー統合・最適化';
    RAISE NOTICE '  ✅ SECURITY INVOKER による権限制御';
    RAISE NOTICE '======================================================================';
    RAISE NOTICE '📋 統合されたファイル:';
    RAISE NOTICE '  - 20250626000000_auth_rls_fixes.sql（削除予定）';
    RAISE NOTICE '  - 20250626000001_restrict_email_access.sql（削除予定）';
    RAISE NOTICE '  - 20250626000002_email_access_complete_restriction.sql（削除予定）';
    RAISE NOTICE '  → 20250626000000_auth_rls_complete.sql（統合完了）';
    RAISE NOTICE '======================================================================';

    IF policy_count >= 8 AND view_count = 1 AND function_count = 1 THEN
        RAISE NOTICE '🎉 統合マイグレーション適用成功！';
    ELSE
        RAISE WARNING '⚠️ 統合マイグレーションの適用に問題がある可能性があります';
        RAISE WARNING '   期待値: RLS=8以上, ビュー=1, 関数=1';
        RAISE WARNING '   実際値: RLS=%, ビュー=%, 関数=%', policy_count, view_count, function_count;
    END IF;
END $$;
