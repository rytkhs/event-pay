-- ゲストトークン経由でのStripe Connect アカウントアクセスを許可するポリシー
-- ゲストが参加しているイベントの主催者のStripe Connectアカウント情報のみアクセス可能

CREATE POLICY "Guests can view event organizer stripe accounts"
ON "public"."stripe_connect_accounts"
FOR SELECT
TO "anon"
USING (
  -- ゲストトークンが設定されている場合のみ
  get_guest_token() IS NOT NULL
  AND
  -- そのゲストトークンを持つ参加者が参加しているイベントの主催者のアカウントのみ
  EXISTS (
    SELECT 1
    FROM public.attendances a
    JOIN public.events e ON a.event_id = e.id
    WHERE a.guest_token = get_guest_token()
    AND e.created_by = stripe_connect_accounts.user_id
  )
);

COMMENT ON POLICY "Guests can view event organizer stripe accounts" ON "public"."stripe_connect_accounts" IS
'ゲストトークンを持つ匿名ユーザーが、自身が参加しているイベントの主催者のStripe Connectアカウント情報（決済処理に必要な最小限の情報）にのみアクセス可能';
