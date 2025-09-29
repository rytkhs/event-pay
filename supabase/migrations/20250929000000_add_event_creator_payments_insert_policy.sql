-- =============================================
-- 主催者用paymentsテーブルINSERTポリシー追加
-- Service Role依存からRLSポリシーベースのアクセス制御に移行
-- =============================================

-- 主催者が自分のイベントの参加者に対して決済レコードを作成できるポリシー
CREATE POLICY "event_creators_can_insert_payments"
ON "public"."payments"
FOR INSERT
TO "authenticated"
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "public"."attendances" "a"
    JOIN "public"."events" "e" ON "a"."event_id" = "e"."id"
    WHERE "a"."id" = "payments"."attendance_id"
    AND "e"."created_by" = "auth"."uid"()
  )
);

-- 補足：
-- 1. このポリシーにより、主催者は認証済みクライアントでpaymentsのINSERTが可能
-- 2. 既存のSELECTポリシー「event_creators_can_view_payments」と一貫性を保持
-- 3. ゲスト用UPDATEポリシー「Guest token update payment details」との併存
-- 4. Service Roleの使用を最小限に抑制し、セキュリティを向上
-- 5. パフォーマンス: attendances.id, events.created_byにインデックスが存在するため効率的
