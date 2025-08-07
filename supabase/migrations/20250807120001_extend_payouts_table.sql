-- ====================================================================
-- 決済・送金機能: payoutsテーブル拡張
-- ====================================================================

-- payoutsテーブルに必要なフィールドを追加
ALTER TABLE public.payouts 
ADD COLUMN stripe_account_id VARCHAR(255) NOT NULL DEFAULT '',
ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN last_error TEXT,
ADD COLUMN transfer_group VARCHAR(255); -- Transfer grouping for related payments

-- stripe_account_idのデフォルト値を削除（NOT NULL制約は維持）
ALTER TABLE public.payouts 
ALTER COLUMN stripe_account_id DROP DEFAULT;

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_payouts_event_id ON public.payouts(event_id);
CREATE INDEX IF NOT EXISTS idx_payouts_user_id ON public.payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_stripe_transfer ON public.payouts(stripe_transfer_id);
CREATE INDEX idx_payouts_stripe_account ON public.payouts(stripe_account_id);
CREATE INDEX idx_payouts_transfer_group ON public.payouts(transfer_group);

-- RLSポリシーの設定
-- 主催者は自分のイベントの送金情報のみ閲覧可能
CREATE POLICY "event_creators_can_view_payouts" ON public.payouts
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = payouts.event_id
        AND e.created_by = auth.uid()
    )
);

-- ユーザーは自分の送金情報のみ閲覧可能
CREATE POLICY "users_can_view_own_payouts" ON public.payouts
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 送金レコードの作成・更新はサーバーサイドAPIのみ（service_roleキー使用）
-- 通常のユーザーには INSERT/UPDATE/DELETE 権限を与えない

COMMENT ON COLUMN public.payouts.stripe_account_id IS 'Stripe Connect Account ID';
COMMENT ON COLUMN public.payouts.retry_count IS '送金処理のリトライ回数';
COMMENT ON COLUMN public.payouts.last_error IS '最後に発生したエラーメッセージ';
COMMENT ON COLUMN public.payouts.transfer_group IS 'Transfer group for related payments and transfers';