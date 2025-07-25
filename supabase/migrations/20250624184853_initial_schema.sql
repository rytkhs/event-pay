-- EventPay: 初期スキーマ定義
-- 目的: アプリケーションの基本となる全ての型、テーブル、ビュー、RLSポリシーを定義する。
-- 修正方針: 技術設計書との整合性を確保し、セキュリティとデータ整合性を強化。

-- ====================================================================
-- 1. ENUM型定義
-- ====================================================================
CREATE TYPE public.event_status_enum AS ENUM ('upcoming', 'ongoing', 'past', 'cancelled');
CREATE TYPE public.payment_method_enum AS ENUM ('stripe', 'cash');
CREATE TYPE public.payment_status_enum AS ENUM ('pending', 'paid', 'failed', 'received', 'completed', 'refunded', 'waived');
CREATE TYPE public.attendance_status_enum AS ENUM ('attending', 'not_attending', 'maybe');
CREATE TYPE public.stripe_account_status_enum AS ENUM ('unverified', 'onboarding', 'verified', 'restricted');
CREATE TYPE public.payout_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');

COMMENT ON TYPE public.payment_status_enum IS '決済状況 (completedは無料イベント用)';

-- ====================================================================
-- 2. テーブル定義
-- ====================================================================

-- users: 運営者情報 (Supabase auth.usersと同期)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- events: イベント情報
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    location VARCHAR(500),
    fee INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    description TEXT,
    registration_deadline TIMESTAMP WITH TIME ZONE,
    payment_deadline TIMESTAMP WITH TIME ZONE,
    payment_methods public.payment_method_enum[] NOT NULL CHECK (array_length(payment_methods, 1) > 0),
    invite_token VARCHAR(255) UNIQUE,
    status public.event_status_enum NOT NULL DEFAULT 'upcoming',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT events_date_after_creation CHECK (date > created_at),
    CONSTRAINT events_registration_deadline_before_event CHECK (registration_deadline IS NULL OR registration_deadline < date),
    CONSTRAINT events_payment_deadline_before_event CHECK (payment_deadline IS NULL OR payment_deadline < date),
    CONSTRAINT events_payment_deadline_after_registration CHECK (payment_deadline IS NULL OR registration_deadline IS NULL OR payment_deadline >= registration_deadline)
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- attendances: イベントへの出欠情報
CREATE TABLE public.attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    nickname VARCHAR(50) NOT NULL CHECK (LENGTH(TRIM(nickname)) >= 1),
    email VARCHAR(255) NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    status public.attendance_status_enum NOT NULL,
    guest_token VARCHAR(32) UNIQUE DEFAULT substring(md5(random()::text) from 1 for 32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX attendances_event_email_unique ON public.attendances(event_id, email);

-- payments: 決済情報
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID NOT NULL UNIQUE REFERENCES public.attendances(id) ON DELETE CASCADE,
    method public.payment_method_enum NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0), -- 0円を許容 (無料イベント用)
    status public.payment_status_enum NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    webhook_event_id VARCHAR(100), -- 冪等性確保用
    webhook_processed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT payments_stripe_intent_required CHECK ((method = 'stripe' AND stripe_payment_intent_id IS NOT NULL) OR (method != 'stripe')),
    CONSTRAINT payments_paid_at_when_completed CHECK ((status IN ('paid', 'received', 'completed') AND paid_at IS NOT NULL) OR (status NOT IN ('paid', 'received', 'completed')))
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- stripe_connect_accounts: Stripe Connectアカウント情報
CREATE TABLE public.stripe_connect_accounts (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    stripe_account_id VARCHAR(255) UNIQUE NOT NULL,
    status public.stripe_account_status_enum NOT NULL DEFAULT 'unverified',
    charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

-- payouts: 運営者への売上送金履歴
CREATE TABLE public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    total_stripe_sales INTEGER NOT NULL DEFAULT 0,
    total_stripe_fee INTEGER NOT NULL DEFAULT 0, -- Stripe手数料
    platform_fee INTEGER NOT NULL DEFAULT 0,
    net_payout_amount INTEGER NOT NULL DEFAULT 0,
    status public.payout_status_enum NOT NULL DEFAULT 'pending',
    stripe_transfer_id VARCHAR(255) UNIQUE,
    webhook_event_id VARCHAR(100), -- 冪等性確保用
    webhook_processed_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT, -- 管理用メモ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT payouts_amounts_non_negative CHECK (total_stripe_sales >= 0 AND total_stripe_fee >= 0 AND platform_fee >= 0 AND net_payout_amount >= 0),
    CONSTRAINT payouts_calculation_valid CHECK (net_payout_amount = total_stripe_sales - total_stripe_fee - platform_fee)
);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- invite_links: イベント招待リンク
CREATE TABLE public.invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  max_uses INTEGER, -- NULL = 無制限
  current_uses INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.invite_links ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 3. インデックス作成
-- ====================================================================
CREATE INDEX idx_events_created_by ON public.events(created_by);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_attendances_event_id ON public.attendances(event_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payouts_user_id ON public.payouts(user_id);
CREATE INDEX idx_invite_links_token ON public.invite_links(token);

-- ====================================================================
-- 4. ビューと安全な関数
-- ====================================================================
-- public_profiles: 個人情報を保護しつつ、必要な情報のみを公開するビュー
CREATE OR REPLACE VIEW public.public_profiles AS SELECT id, name, created_at FROM public.users;
GRANT SELECT ON public.public_profiles TO authenticated, service_role;

-- get_event_creator_name: イベント作成者名を安全に取得する関数
CREATE OR REPLACE FUNCTION public.get_event_creator_name(p_creator_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
    RETURN (SELECT name FROM public.users WHERE id = p_creator_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_event_creator_name(UUID) TO authenticated, service_role;

-- ====================================================================
-- 5. 関数とトリガー
-- ====================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attendances_updated_at BEFORE UPDATE ON public.attendances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stripe_connect_accounts_updated_at BEFORE UPDATE ON public.stripe_connect_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invite_links_updated_at BEFORE UPDATE ON public.invite_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.check_attendance_capacity_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE event_capacity INTEGER; current_attending_count INTEGER;
BEGIN
    IF NEW.status = 'attending' THEN
        SELECT capacity INTO event_capacity FROM public.events WHERE id = NEW.event_id;
        IF event_capacity IS NOT NULL THEN
            SELECT COUNT(*) INTO current_attending_count FROM public.attendances WHERE event_id = NEW.event_id AND status = 'attending';
            IF current_attending_count >= event_capacity THEN RAISE EXCEPTION 'イベントの定員（%名）に達しています。', event_capacity; END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER check_attendance_capacity_before_insert_or_update
BEFORE INSERT OR UPDATE ON public.attendances FOR EACH ROW EXECUTE FUNCTION public.check_attendance_capacity_limit();

-- ====================================================================
-- 6. Row Level Security (RLS) ポリシー
-- ====================================================================

-- users: 自分の情報のみアクセス可能
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- INSERT/DELETEはサーバーサイドからのみ (authフック経由)

-- events: 誰でも閲覧可能、作成者のみ管理可能
CREATE POLICY "Anyone can view events" ON public.events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Creators can manage own events" ON public.events FOR ALL TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- attendances: 関係者のみ閲覧可能、書き込みはサーバーサイドのみ
CREATE POLICY "Related parties can view attendances" ON public.attendances FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.events WHERE id = attendances.event_id AND created_by = auth.uid())
);
-- 🚨 INSERT/UPDATE/DELETEポリシーは意図的に作成しない (サーバーサイドAPI経由を強制)

-- payments: 関係者のみ閲覧可能、書き込みはサーバーサイドのみ
CREATE POLICY "Creators can view payments" ON public.payments FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.attendances a JOIN public.events e ON a.event_id = e.id WHERE a.id = payments.attendance_id AND e.created_by = auth.uid())
);
CREATE POLICY "Service role can manage payments" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- stripe_connect_accounts & payouts: 自分 or service_roleのみ管理可能
CREATE POLICY "Users can manage own stripe accounts" ON public.stripe_connect_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own payouts" ON public.payouts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage stripe/payout info" ON public.stripe_connect_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage payouts" ON public.payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- invite_links: 作成者のみ管理可能、誰でも有効なリンクは閲覧可能
CREATE POLICY "Creators can manage invite links" ON public.invite_links FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.events WHERE id = invite_links.event_id AND created_by = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE id = invite_links.event_id AND created_by = auth.uid()));
CREATE POLICY "Anyone can view valid invite links" ON public.invite_links FOR SELECT TO anon, authenticated
    USING (expires_at > NOW() AND (max_uses IS NULL OR current_uses < max_uses));

DO $$
BEGIN
    RAISE NOTICE '✅ Initial schema, RLS, and core functions created successfully.';
END $$;
