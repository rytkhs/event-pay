-- =============================================
-- 主催者用attendancesテーブルRLSポリシー追加
-- Service Role依存からRLSポリシーベースのアクセス制御に移行
-- =============================================

-- 主催者が自分のイベントに参加者を追加できるポリシー
CREATE POLICY "event_creators_can_insert_attendances"
ON "public"."attendances"
FOR INSERT
TO "authenticated"
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "public"."events" "e"
    WHERE "e"."id" = "attendances"."event_id"
    AND "e"."created_by" = "auth"."uid"()
  )
);

-- 主催者が自分のイベントの参加者を更新できるポリシー
CREATE POLICY "event_creators_can_update_attendances"
ON "public"."attendances"
FOR UPDATE
TO "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM "public"."events" "e"
    WHERE "e"."id" = "attendances"."event_id"
    AND "e"."created_by" = "auth"."uid"()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "public"."events" "e"
    WHERE "e"."id" = "attendances"."event_id"
    AND "e"."created_by" = "auth"."uid"()
  )
);

-- 補足：
-- 1. これらのポリシーにより、主催者は認証済みクライアントでattendancesの操作が可能
-- 2. Service Roleの使用を最小限に抑制し、セキュリティを向上
-- 3. 既存のSELECTポリシー「event_creators_can_view_attendances」と一貫性を保持
-- 4. ゲスト用ポリシー「guest_token_can_access_own_attendance」との併存
-- 5. パフォーマンス: events.created_byにインデックスが存在するため効率的
