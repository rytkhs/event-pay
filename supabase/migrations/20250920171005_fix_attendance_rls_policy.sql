-- =============================================
-- attendancesテーブルのRLSポリシー追加
-- =============================================

-- ゲストトークンを使って自分のattendanceレコードにアクセスできるポリシーを追加
CREATE POLICY "guest_token_can_access_own_attendance"
ON "public"."attendances"
FOR ALL
TO "anon", "authenticated"
USING (
    -- ゲストトークンで自分のattendanceレコードにアクセス可能
    guest_token = get_guest_token()
)
WITH CHECK (
    -- INSERT時も同様の制限を適用
    guest_token = get_guest_token()
);

-- 補足：get_guest_token()は既存の関数で、以下の優先順位で取得：
-- 1. JWTクレーム（将来対応）
-- 2. HTTPリクエストヘッダー
-- 3. テスト用設定（test.guest_token）
--
-- この関数により、ゲストトークンを持つユーザーが
-- 自分のattendanceレコードのみにアクセス可能となる
