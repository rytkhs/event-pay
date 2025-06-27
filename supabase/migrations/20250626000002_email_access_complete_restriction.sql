-- AUTH-001: 公開用プロフィールビュー作成
-- 目的: RLSが適用された安全なビューを介して、限定的なユーザー情報（名前など）を公開する

-- ====================================================================
-- 🔒 public_profiles VIEW
-- ====================================================================

-- 注意: usersテーブルにはemailカラムは存在しない（auth.usersに一元化済み）
-- このマイグレーションでは、安全な公開ビューの作成のみを行う

-- 1. public_profilesビューを作成（emailを含まない）
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
SELECT
    id,
    name,
    created_at
FROM public.users;

-- 2. ビューにRLSポリシーを設定
-- security_invoker = true にすることで、ビューにアクセスするユーザーの権限で
-- ベーステーブル（users）のRLSが適用される。
-- これにより、usersのRLS設定を一元管理できる。
ALTER VIEW public.public_profiles SET (security_invoker = true);

-- 3. usersテーブルのRLSポリシーを更新（全認証済みユーザーが全プロフィールを閲覧可能）
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile without email" ON public.users;
CREATE POLICY "Authenticated users can view all profiles" ON public.users
    FOR SELECT
    TO authenticated
    USING (true);

-- ====================================================================
-- 📝 実装ノート
-- ====================================================================

/*
このマイグレーションの効果:

1. 安全な情報公開:
   - `public_profiles`ビューを通してのみ、ユーザー名などの安全な情報が公開される。
   - `email`などの機密情報は、ビューの定義に含まれないため、漏洩リスクがない。
   - メール情報は`auth.users`に一元化され、サーバーサイドでのみアクセス可能。

2. RLSの一元管理:
   - `security_invoker`により、`users`テーブルのRLSポリシーがそのままビューにも適用される。
   - 認証済みユーザーは全プロフィールを閲覧可能（イベント作成者名の表示等に必要）。

3. システムの簡素化:
   - user_emailsテーブルや複雑な関数は不要
   - データ同期処理が不要
   - 保守性の向上

4. セキュリティ維持:
   - users.email への直接アクセスは物理的に不可能（カラム自体が存在しない）
   - auth.usersへのアクセスはSupabaseのRLSで厳格に制御
   - メール情報が必要な場合は、サーバーサイドでセッション情報から取得
*/
