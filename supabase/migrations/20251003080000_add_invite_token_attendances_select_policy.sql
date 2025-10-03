-- =============================================
-- attendancesテーブルに招待トークンアクセス用のRLSポリシーを追加
-- =============================================
--
-- 問題:
-- 招待リンクページで匿名ユーザーが参加者数をカウントできない
-- （定員判定に必要な attendances_count が取得できない）
--
-- 原因:
-- 既存のRLSポリシーでは以下のアクセスしか許可されていない:
-- 1. service_role による全アクセス
-- 2. イベント作成者による参加者閲覧
-- 3. ゲストトークンによる自分の参加情報へのアクセス
--
-- 解決策:
-- 招待トークンを持つユーザー（anon/authenticated）が、
-- can_access_event() 関数を通じて参加者情報を閲覧できるようにする
-- =============================================

-- 招待トークンでイベントの参加者を閲覧できるポリシーを追加
CREATE POLICY "invite_token_can_view_attendances"
ON "public"."attendances"
FOR SELECT
TO "anon", "authenticated"
USING (
  -- can_access_event() 関数が以下をチェック:
  -- 1. イベント作成者か
  -- 2. x-invite-token ヘッダーで有効な招待トークンを持っているか
  -- 3. ゲストトークンでイベントの参加者か
  public.can_access_event(event_id)
);

-- コメント追加
COMMENT ON POLICY "invite_token_can_view_attendances" ON "public"."attendances" IS
'招待トークンを持つユーザーがイベントの参加者情報を閲覧可能にする。定員判定のための参加者数カウントに使用される。';
