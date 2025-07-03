-- EventPay データベーステーブル作成マイグレーション
-- DB-002～005: データベース基盤実装（テーブル作成・RLS・シードデータ）

-- ====================================================================
-- DB-002: 基本テーブル作成
-- ====================================================================

-- usersテーブル作成
-- 運営者情報を管理。Supabase auth.usersテーブルと同期
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- eventsテーブル作成
-- イベント情報を管理
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    location VARCHAR(500),
    fee INTEGER NOT NULL DEFAULT 0,
    capacity INTEGER,
    description TEXT,
    registration_deadline TIMESTAMP WITH TIME ZONE,
    payment_deadline TIMESTAMP WITH TIME ZONE,
    payment_methods payment_method_enum[] NOT NULL,
    invite_token VARCHAR(255) UNIQUE NOT NULL,
    status event_status_enum NOT NULL DEFAULT 'upcoming',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- attendancesテーブル作成
-- イベントへの出欠情報を管理
CREATE TABLE public.attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    nickname VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    status attendance_status_enum NOT NULL,
    guest_token VARCHAR(32) UNIQUE DEFAULT substring(md5(random()::text) from 1 for 32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- paymentsテーブル作成
-- 全ての決済情報（Stripe, 現金, 無料）を一元管理
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID NOT NULL UNIQUE REFERENCES public.attendances(id) ON DELETE CASCADE,
    method payment_method_enum NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    status payment_status_enum NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    webhook_event_id VARCHAR(100),
    webhook_processed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- stripe_connect_accountsテーブル作成
-- 運営者のStripe Connectアカウント情報を管理
CREATE TABLE public.stripe_connect_accounts (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    stripe_account_id VARCHAR(255) UNIQUE NOT NULL,
    status stripe_account_status_enum NOT NULL DEFAULT 'unverified',
    charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- payoutsテーブル作成
-- 運営者への売上送金履歴を管理
CREATE TABLE public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    total_stripe_sales INTEGER NOT NULL DEFAULT 0,
    total_stripe_fee INTEGER NOT NULL DEFAULT 0,
    platform_fee INTEGER NOT NULL DEFAULT 0,
    net_payout_amount INTEGER NOT NULL DEFAULT 0,
    status payout_status_enum NOT NULL DEFAULT 'pending',
    stripe_transfer_id VARCHAR(255) UNIQUE,
    webhook_event_id VARCHAR(100),
    webhook_processed_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ====================================================================
-- DB-003: 制約とインデックス設定
-- ====================================================================

-- usersテーブルの制約
-- (email関連の制約は削除済み - メール管理はauth.usersに一元化)

-- eventsテーブルの制約
ALTER TABLE public.events ADD CONSTRAINT events_fee_positive
    CHECK (fee >= 0);

ALTER TABLE public.events ADD CONSTRAINT events_date_future
    CHECK (date > created_at);

ALTER TABLE public.events ADD CONSTRAINT events_capacity_positive
    CHECK (capacity IS NULL OR capacity > 0);

ALTER TABLE public.events ADD CONSTRAINT events_registration_deadline_before_event
    CHECK (registration_deadline IS NULL OR registration_deadline < date);

ALTER TABLE public.events ADD CONSTRAINT events_payment_deadline_before_event
    CHECK (payment_deadline IS NULL OR payment_deadline < date);

ALTER TABLE public.events ADD CONSTRAINT events_payment_deadline_after_registration
    CHECK (payment_deadline IS NULL OR registration_deadline IS NULL
           OR payment_deadline >= registration_deadline);

-- 決済方法と参加費の整合性
ALTER TABLE public.events ADD CONSTRAINT events_payment_methods_fee_consistency
    CHECK (
        (fee = 0 AND 'free' = ANY(payment_methods)) OR
        (fee > 0 AND NOT ('free' = ANY(payment_methods)))
    );

-- 決済方法の妥当性
ALTER TABLE public.events ADD CONSTRAINT events_payment_methods_not_empty
    CHECK (array_length(payment_methods, 1) > 0);

-- attendancesテーブルの制約
ALTER TABLE public.attendances ADD CONSTRAINT attendances_nickname_not_empty
    CHECK (LENGTH(TRIM(nickname)) >= 1);

ALTER TABLE public.attendances ADD CONSTRAINT attendances_email_format
    CHECK (email IS NULL OR email ~* '^[A-Za-z0-9\._%\+\-]+@[A-Za-z0-9\.\-]+\.[A-Za-z]{2,}$');

-- 同一イベントでの重複防止（メールアドレスがある場合）
CREATE UNIQUE INDEX attendances_event_email_unique
    ON public.attendances(event_id, email)
    WHERE email IS NOT NULL;

-- paymentsテーブルの制約
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_non_negative
    CHECK (amount >= 0);

-- Stripe決済の場合、stripe_payment_intent_idは必須
ALTER TABLE public.payments ADD CONSTRAINT payments_stripe_intent_required
    CHECK (
        (method = 'stripe' AND stripe_payment_intent_id IS NOT NULL) OR
        (method != 'stripe' AND stripe_payment_intent_id IS NULL)
    );

-- 無料決済の場合、金額は0円
ALTER TABLE public.payments ADD CONSTRAINT payments_free_amount_zero
    CHECK (
        (method = 'free' AND amount = 0) OR
        (method != 'free')
    );

-- 決済完了時刻の妥当性
ALTER TABLE public.payments ADD CONSTRAINT payments_paid_at_when_completed
    CHECK (
        (status IN ('paid', 'received', 'completed') AND paid_at IS NOT NULL) OR
        (status NOT IN ('paid', 'received', 'completed'))
    );

-- payoutsテーブルの制約
ALTER TABLE public.payouts ADD CONSTRAINT payouts_amounts_non_negative
    CHECK (total_stripe_sales >= 0 AND total_stripe_fee >= 0
           AND platform_fee >= 0 AND net_payout_amount >= 0);

ALTER TABLE public.payouts ADD CONSTRAINT payouts_calculation_valid
    CHECK (net_payout_amount = total_stripe_sales - total_stripe_fee - platform_fee);

-- ====================================================================
-- パフォーマンス用インデックス作成
-- ====================================================================

-- eventsテーブルのインデックス
CREATE INDEX idx_events_created_by ON public.events(created_by);
CREATE INDEX idx_events_date ON public.events(date);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_invite_token ON public.events(invite_token);

-- attendancesテーブルのインデックス
CREATE INDEX idx_attendances_event_id ON public.attendances(event_id);
CREATE INDEX idx_attendances_guest_token ON public.attendances(guest_token);
CREATE INDEX idx_attendances_status ON public.attendances(status);

-- paymentsテーブルのインデックス
CREATE INDEX idx_payments_attendance_id ON public.payments(attendance_id);
CREATE INDEX idx_payments_method ON public.payments(method);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_stripe_payment_intent_id ON public.payments(stripe_payment_intent_id);

-- payoutsテーブルのインデックス
CREATE INDEX idx_payouts_event_id ON public.payouts(event_id);
CREATE INDEX idx_payouts_user_id ON public.payouts(user_id);
CREATE INDEX idx_payouts_status ON public.payouts(status);

-- ====================================================================
-- DB-004: RLSポリシー初期実装
-- ====================================================================

-- 全テーブルでRLS有効化
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- usersテーブルのRLSポリシー
-- 注意: 具体的なポリシーは後続のマイグレーションで定義される
-- ここでは基本的な更新権限のみ設定
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- eventsテーブルのRLSポリシー
-- 認証済みユーザーは全イベントを閲覧可能
CREATE POLICY "Authenticated users can view events" ON public.events
    FOR SELECT
    TO authenticated
    USING (true);

-- 認証済みユーザーはイベントを作成可能
CREATE POLICY "Authenticated users can create events" ON public.events
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

-- イベント作成者のみが更新・削除可能
CREATE POLICY "Event creators can update own events" ON public.events
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Event creators can delete own events" ON public.events
    FOR DELETE
    TO authenticated
    USING (auth.uid() = created_by);

-- attendancesテーブルのRLSポリシー
-- イベント作成者は自身のイベントの参加情報を閲覧可能
CREATE POLICY "Event creators can view attendances" ON public.attendances
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events
            WHERE id = attendances.event_id
            AND created_by = auth.uid()
        )
    );

-- paymentsテーブルのRLSポリシー
-- イベント作成者は自身のイベントの決済情報を閲覧可能
CREATE POLICY "Event creators can view payments" ON public.payments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.attendances a
            JOIN public.events e ON a.event_id = e.id
            WHERE a.id = payments.attendance_id
            AND e.created_by = auth.uid()
        )
    );

-- stripe_connect_accountsテーブルのRLSポリシー
-- ユーザーは自身のStripe Connect情報のみアクセス可能
CREATE POLICY "Users can view own stripe accounts" ON public.stripe_connect_accounts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own stripe accounts" ON public.stripe_connect_accounts
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- payoutsテーブルのRLSポリシー
-- ユーザーは自身の送金履歴のみ閲覧可能
CREATE POLICY "Users can view own payouts" ON public.payouts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- ====================================================================
-- get_event_creator_name関数の作成
-- ====================================================================

-- 注意: public_profilesビューは後続のマイグレーションで作成される

-- get_event_creator_name関数（安全なイベント作成者名取得）
CREATE OR REPLACE FUNCTION public.get_event_creator_name(creator_id UUID)
RETURNS VARCHAR
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT name FROM public.users WHERE id = creator_id;
$$;

-- 関数の実行権限設定
GRANT EXECUTE ON FUNCTION public.get_event_creator_name(UUID) TO authenticated, service_role;

-- ====================================================================
-- updated_atカラムの自動更新設定
-- ====================================================================

-- updated_atを自動更新するトリガー関数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 各テーブルにupdated_at自動更新トリガーを設定
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendances_updated_at
    BEFORE UPDATE ON public.attendances
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stripe_connect_accounts_updated_at
    BEFORE UPDATE ON public.stripe_connect_accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payouts_updated_at
    BEFORE UPDATE ON public.payouts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ====================================================================
-- マイグレーション完了の確認
-- ====================================================================

DO $$
DECLARE
    table_count INTEGER;
    constraint_count INTEGER;
    index_count INTEGER;
    policy_count INTEGER;
BEGIN
    -- テーブル数確認
    SELECT COUNT(*) INTO table_count
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('users', 'events', 'attendances', 'payments', 'stripe_connect_accounts', 'payouts');

    -- 制約数確認
    SELECT COUNT(*) INTO constraint_count
    FROM pg_constraint
    WHERE conname LIKE 'events_%' OR conname LIKE 'payments_%' OR conname LIKE 'attendances_%' OR conname LIKE 'payouts_%';

    -- インデックス数確認
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%';

    -- RLSポリシー数確認
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public';

    RAISE NOTICE 'EventPay データベース基盤の作成が完了しました:';
    RAISE NOTICE '- 作成されたテーブル数: %', table_count;
    RAISE NOTICE '- 作成された制約数: %', constraint_count;
    RAISE NOTICE '- 作成されたインデックス数: %', index_count;
    RAISE NOTICE '- 作成されたRLSポリシー数: %', policy_count;
    RAISE NOTICE 'get_event_creator_name関数を作成しました';

    IF table_count = 6 THEN
        RAISE NOTICE '✅ DB-002: 基本テーブル作成完了';
        RAISE NOTICE '✅ DB-003: 制約とインデックス設定完了';
        RAISE NOTICE '✅ DB-004: RLSポリシー初期実装完了';
    ELSE
        RAISE EXCEPTION 'テーブル作成に失敗しました。期待値: 6, 実際: %', table_count;
    END IF;
END
$$;
