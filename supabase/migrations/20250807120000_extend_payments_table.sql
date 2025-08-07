-- ====================================================================
-- 決済・送金機能: paymentsテーブル拡張
-- ====================================================================

-- paymentsテーブルにstripe_session_idフィールドを追加
ALTER TABLE public.payments 
ADD COLUMN stripe_session_id VARCHAR(255),
ADD COLUMN stripe_account_id VARCHAR(255); -- Connect Account ID for webhook processing

-- stripe_session_idのインデックスを作成
CREATE INDEX idx_payments_stripe_session_id ON public.payments(stripe_session_id);
CREATE INDEX idx_payments_stripe_account_id ON public.payments(stripe_account_id);

-- 既存のインデックスを確認・追加
CREATE INDEX IF NOT EXISTS idx_payments_attendance_id ON public.payments(attendance_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent ON public.payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_webhook_event ON public.payments(webhook_event_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- RLSポリシーの設定
-- 主催者は自分のイベントの決済情報のみ閲覧可能
CREATE POLICY "event_creators_can_view_payments" ON public.payments
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.attendances a
        JOIN public.events e ON a.event_id = e.id
        WHERE a.id = payments.attendance_id
        AND e.created_by = auth.uid()
    )
);

-- ゲストトークンによる決済情報の閲覧は別途実装
-- （ゲストアクセスはauthenticatedロールではないため、ここでは定義しない）

-- 決済レコードの作成・更新はサーバーサイドAPIのみ（service_roleキー使用）
-- 通常のユーザーには INSERT/UPDATE/DELETE 権限を与えない

COMMENT ON COLUMN public.payments.stripe_session_id IS 'Stripe Checkout Session ID';
COMMENT ON COLUMN public.payments.stripe_account_id IS 'Stripe Connect Account ID for webhook processing';