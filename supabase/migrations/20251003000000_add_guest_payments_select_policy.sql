-- =============================================
-- paymentsテーブルにゲストトークン用SELECTポリシーを追加
-- =============================================
-- 既存のUPDATEポリシーはあるが、SELECTポリシーが欠けていたため追加

BEGIN;

-- ゲストトークンを持つユーザーが自分の参加に関連する決済情報を閲覧できるポリシー
CREATE POLICY "guest_token_can_view_own_payments"
ON "public"."payments"
FOR SELECT
TO "anon", "authenticated"
USING (
    -- 自分のattendanceに紐づく決済のみ閲覧可能
    EXISTS (
        SELECT 1
        FROM "public"."attendances" "a"
        WHERE "a"."id" = "payments"."attendance_id"
          AND "a"."guest_token" IS NOT NULL
          AND "a"."guest_token"::text = "public"."get_guest_token"()
    )
);

COMMENT ON POLICY "guest_token_can_view_own_payments" ON "public"."payments" IS
'ゲストトークンを持つユーザーが自分の参加に関連する決済情報を閲覧できるポリシー。既存のUPDATEポリシーに対応するSELECTポリシー。';

COMMIT;
