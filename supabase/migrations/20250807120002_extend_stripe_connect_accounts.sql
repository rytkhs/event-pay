-- ====================================================================
-- 決済・送金機能: stripe_connect_accountsテーブル拡張
-- ====================================================================

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_user_id ON public.stripe_connect_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_stripe_account_id ON public.stripe_connect_accounts(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_status ON public.stripe_connect_accounts(status);

-- RLSポリシーの設定
-- ユーザーは自分のStripe Connectアカウント情報のみ閲覧可能
CREATE POLICY "users_can_view_own_stripe_accounts" ON public.stripe_connect_accounts
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Stripe Connectアカウントの作成・更新はサーバーサイドAPIのみ（service_roleキー使用）
-- 通常のユーザーには INSERT/UPDATE/DELETE 権限を与えない