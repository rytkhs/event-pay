-- ====================================================================
-- EventPay: 統合初期スキーマ
-- 目的: 全機能を含む統合データベーススキーマの定義
-- ====================================================================

BEGIN;

-- ====================================================================
-- 1. ENUM型定義
-- ====================================================================
CREATE TYPE public.event_status_enum AS ENUM ('upcoming', 'ongoing', 'past', 'canceled');
CREATE TYPE public.payment_method_enum AS ENUM ('stripe', 'cash');
CREATE TYPE public.payment_status_enum AS ENUM ('pending', 'paid', 'failed', 'received', 'completed', 'refunded', 'waived');
CREATE TYPE public.attendance_status_enum AS ENUM ('attending', 'not_attending', 'maybe');
CREATE TYPE public.stripe_account_status_enum AS ENUM ('unverified', 'onboarding', 'verified', 'restricted');
CREATE TYPE public.payout_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE public.admin_reason_enum AS ENUM ('user_cleanup', 'test_data_setup', 'system_maintenance', 'emergency_access', 'data_migration', 'security_investigation');
CREATE TYPE public.suspicious_activity_type_enum AS ENUM ('EMPTY_RESULT_SET', 'ADMIN_ACCESS_ATTEMPT', 'INVALID_TOKEN_PATTERN', 'RATE_LIMIT_EXCEEDED', 'UNAUTHORIZED_RLS_BYPASS', 'BULK_DATA_ACCESS', 'UNUSUAL_ACCESS_PATTERN');
CREATE TYPE public.security_severity_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE public.settlement_mode_enum AS ENUM ('destination_charge');

COMMENT ON TYPE public.payment_status_enum IS '決済状況 (completedは無料イベント用, processing_errorは送金成功・DB更新失敗)';

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
    CONSTRAINT events_registration_deadline_before_event CHECK (registration_deadline IS NULL OR registration_deadline <= date),
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
    guest_token VARCHAR(36) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX attendances_event_email_unique ON public.attendances(event_id, email);
COMMENT ON COLUMN public.attendances.guest_token IS 'ゲストアクセス用のトークン。gst_プレフィックス付き（Base64形式、合計36文字：gst_ + 32文字）';

-- payments: 決済情報（Destination charges対応）
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
    method public.payment_method_enum NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    status public.payment_status_enum NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    webhook_event_id VARCHAR(100),
    webhook_processed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    stripe_session_id VARCHAR(255),
    stripe_account_id VARCHAR(255),
    -- Destination charges fields
    application_fee_amount INTEGER NOT NULL DEFAULT 0,
    stripe_checkout_session_id VARCHAR(255),
    transfer_group VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    stripe_balance_transaction_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    stripe_transfer_id VARCHAR(255),
    refunded_amount INTEGER NOT NULL DEFAULT 0,
    destination_account_id VARCHAR(255),
    application_fee_id VARCHAR(255),
    application_fee_refund_id VARCHAR(255),
    application_fee_refunded_amount INTEGER NOT NULL DEFAULT 0,
    -- Tax compliance fields
    application_fee_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    application_fee_tax_amount INTEGER NOT NULL DEFAULT 0,
    application_fee_excl_tax INTEGER NOT NULL DEFAULT 0,
    tax_included BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT payments_stripe_intent_required CHECK (
        (method = 'stripe' AND status = 'pending') OR
        (method = 'stripe' AND status != 'pending' AND stripe_payment_intent_id IS NOT NULL) OR
        (method != 'stripe')
    ),
    CONSTRAINT payments_paid_at_when_completed CHECK ((status IN ('paid', 'received', 'completed') AND paid_at IS NOT NULL) OR (status NOT IN ('paid', 'received', 'completed'))),
    CONSTRAINT chk_payments_refunded_amount_non_negative CHECK (refunded_amount >= 0),
    CONSTRAINT chk_payments_application_fee_amount_non_negative CHECK (application_fee_amount >= 0),
    CONSTRAINT chk_payments_application_fee_refunded_amount_non_negative CHECK (application_fee_refunded_amount >= 0)
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

-- payouts: 運営者への売上送金履歴（レポート・スナップショット用途）
CREATE TABLE public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    total_stripe_sales INTEGER NOT NULL DEFAULT 0,
    total_stripe_fee INTEGER NOT NULL DEFAULT 0,
    platform_fee INTEGER NOT NULL DEFAULT 0,
    net_payout_amount INTEGER NOT NULL DEFAULT 0,
    status public.payout_status_enum NOT NULL DEFAULT 'completed',
    stripe_transfer_id VARCHAR(255) UNIQUE,
    webhook_event_id VARCHAR(100),
    webhook_processed_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    stripe_account_id VARCHAR(255) NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    transfer_group VARCHAR(255),
    settlement_mode public.settlement_mode_enum DEFAULT 'destination_charge',
    generated_at TIMESTAMPTZ DEFAULT now(),
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
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.invite_links ENABLE ROW LEVEL SECURITY;

-- webhook_events: Webhook処理の冪等性を保証するためのテーブル
CREATE TABLE public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processing_result JSONB,
    processed_at TIMESTAMPTZ NOT NULL,
    stripe_account_id VARCHAR(255),
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'processed',
    processing_error TEXT,
    stripe_event_created BIGINT,
    object_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT webhook_events_stripe_event_id_unique UNIQUE (stripe_event_id)
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- fee_config: 手数料設定テーブル（シングルトン）
CREATE TABLE public.fee_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    stripe_base_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0360,
    stripe_fixed_fee INTEGER NOT NULL DEFAULT 0,
    platform_fee_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
    platform_fixed_fee INTEGER NOT NULL DEFAULT 0,
    min_platform_fee INTEGER NOT NULL DEFAULT 0,
    max_platform_fee INTEGER NOT NULL DEFAULT 0,
    min_payout_amount INTEGER NOT NULL DEFAULT 100,
    platform_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    is_tax_included BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 初期設定値
INSERT INTO public.fee_config (
    id, stripe_base_rate, stripe_fixed_fee,
    platform_fee_rate, platform_fixed_fee, min_platform_fee, max_platform_fee,
    min_payout_amount, platform_tax_rate, is_tax_included
) VALUES (
    1, 0.0360, 0, 0, 0, 0, 0, 100, 10.00, true
);

-- scheduler_locks: スケジューラー排他制御用テーブル
CREATE TABLE public.scheduler_locks (
    lock_name text PRIMARY KEY,
    acquired_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    process_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduler_locks ENABLE ROW LEVEL SECURITY;

-- payout_scheduler_logs: PayoutScheduler実行ログテーブル
CREATE TABLE public.payout_scheduler_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id VARCHAR(100) NOT NULL UNIQUE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    processing_time_ms INTEGER NOT NULL CHECK (processing_time_ms >= 0),
    eligible_events_count INTEGER NOT NULL DEFAULT 0 CHECK (eligible_events_count >= 0),
    successful_payouts INTEGER NOT NULL DEFAULT 0 CHECK (successful_payouts >= 0),
    failed_payouts INTEGER NOT NULL DEFAULT 0 CHECK (failed_payouts >= 0),
    total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    dry_run BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    results JSONB,
    summary JSONB,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT valid_payout_counts CHECK (successful_payouts + failed_payouts <= eligible_events_count),
    CONSTRAINT valid_execution_time CHECK (end_time >= start_time)
);
ALTER TABLE public.payout_scheduler_logs ENABLE ROW LEVEL SECURITY;

-- システムログテーブル
CREATE TABLE public.system_logs (
    id BIGSERIAL PRIMARY KEY,
    operation_type VARCHAR(50) NOT NULL,
    details JSONB,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- セキュリティ監査ログテーブル
CREATE TABLE public.security_audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    user_role TEXT,
    ip_address INET,
    details JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- 管理者アクセス監査テーブル
CREATE TABLE public.admin_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason public.admin_reason_enum NOT NULL,
    context TEXT NOT NULL,
    operation_details JSONB,
    ip_address INET,
    user_agent TEXT,
    accessed_tables TEXT[],
    session_id TEXT,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.admin_access_audit ENABLE ROW LEVEL SECURITY;

-- ゲストアクセス監査テーブル
CREATE TABLE public.guest_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_token_hash VARCHAR(64) NOT NULL,
    attendance_id UUID REFERENCES public.attendances(id) ON DELETE SET NULL,
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    operation_type VARCHAR(20),
    success BOOLEAN NOT NULL,
    result_count INTEGER,
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    duration_ms INTEGER,
    error_code VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.guest_access_audit ENABLE ROW LEVEL SECURITY;

-- 疑わしい活動ログテーブル
CREATE TABLE public.suspicious_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_type public.suspicious_activity_type_enum NOT NULL,
    table_name VARCHAR(100),
    user_role VARCHAR(50),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    attempted_action VARCHAR(100),
    expected_result_count INTEGER,
    actual_result_count INTEGER,
    context JSONB,
    severity public.security_severity_enum DEFAULT 'MEDIUM',
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    detection_method VARCHAR(100),
    false_positive BOOLEAN DEFAULT FALSE,
    investigated_at TIMESTAMP WITH TIME ZONE,
    investigated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    investigation_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.suspicious_activity_log ENABLE ROW LEVEL SECURITY;

-- 不正アクセス試行ログテーブル
CREATE TABLE public.unauthorized_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempted_resource VARCHAR(200) NOT NULL,
    required_permission VARCHAR(100),
    user_context JSONB,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_token_hash VARCHAR(64),
    detection_method VARCHAR(50) NOT NULL,
    blocked_by_rls BOOLEAN DEFAULT FALSE,
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    request_path VARCHAR(500),
    request_method VARCHAR(10),
    request_headers JSONB,
    response_status INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.unauthorized_access_log ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 3. インデックス作成
-- ====================================================================

-- 基本インデックス
CREATE INDEX idx_events_created_by ON public.events(created_by);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_attendances_event_id ON public.attendances(event_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payouts_user_id ON public.payouts(user_id);
CREATE INDEX idx_invite_links_token ON public.invite_links(token);

-- Payments テーブル関連
CREATE INDEX idx_payments_attendance_id ON public.payments(attendance_id);
CREATE INDEX idx_payments_stripe_payment_intent ON public.payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_stripe_session_id ON public.payments(stripe_session_id);
CREATE INDEX idx_payments_stripe_account_id ON public.payments(stripe_account_id);
CREATE INDEX idx_payments_webhook_event ON public.payments(webhook_event_id);
CREATE UNIQUE INDEX idx_payments_stripe_charge_id ON public.payments(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
CREATE INDEX idx_payments_transfer_group ON public.payments(transfer_group);
CREATE INDEX idx_payments_balance_txn ON public.payments(stripe_balance_transaction_id);
CREATE INDEX idx_payments_checkout_session ON public.payments(stripe_checkout_session_id);
CREATE INDEX idx_payments_customer_id ON public.payments(stripe_customer_id);
CREATE INDEX idx_payments_destination_account ON public.payments(destination_account_id);
CREATE INDEX idx_payments_tax_rate ON public.payments(application_fee_tax_rate);
CREATE INDEX idx_payments_tax_included ON public.payments(tax_included);
CREATE INDEX idx_payments_method_status_paid ON public.payments (method, status) WHERE method = 'stripe' AND status = 'paid';
CREATE INDEX idx_payments_refunded_amount ON public.payments (refunded_amount) WHERE refunded_amount > 0;
-- 参加1件あたり未確定決済の重複防止（pending/failed）
CREATE UNIQUE INDEX IF NOT EXISTS unique_open_payment_per_attendance
ON public.payments(attendance_id)
WHERE status IN ('pending','failed');

-- Payouts テーブル関連
CREATE INDEX idx_payouts_event_id ON public.payouts(event_id);
CREATE INDEX idx_payouts_status ON public.payouts(status);
CREATE INDEX idx_payouts_stripe_transfer ON public.payouts(stripe_transfer_id);
CREATE INDEX idx_payouts_stripe_account ON public.payouts(stripe_account_id);
CREATE INDEX idx_payouts_transfer_group ON public.payouts(transfer_group);
CREATE INDEX idx_payouts_event_generated_at ON public.payouts(event_id, generated_at);
CREATE INDEX idx_payouts_settlement_mode ON public.payouts(settlement_mode);
CREATE INDEX idx_payouts_generated_date_jst ON public.payouts (((generated_at AT TIME ZONE 'Asia/Tokyo')::date));

-- Stripe Connect Accounts
CREATE INDEX idx_stripe_connect_accounts_user_id ON public.stripe_connect_accounts(user_id);
CREATE INDEX idx_stripe_connect_accounts_stripe_account_id ON public.stripe_connect_accounts(stripe_account_id);
CREATE INDEX idx_stripe_connect_accounts_status ON public.stripe_connect_accounts(status);

-- Webhook Events
CREATE INDEX idx_webhook_events_event_type ON public.webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed_at ON public.webhook_events(processed_at);
CREATE INDEX idx_webhook_events_stripe_account_id ON public.webhook_events(stripe_account_id);
CREATE INDEX idx_webhook_events_account_event ON public.webhook_events(stripe_account_id, event_type);
CREATE INDEX idx_webhook_events_status ON public.webhook_events(status);
CREATE INDEX idx_webhook_events_failed_only ON public.webhook_events(status) WHERE status = 'failed';
CREATE INDEX idx_webhook_events_dead_only ON public.webhook_events(status) WHERE status = 'dead';
CREATE INDEX idx_webhook_events_event_created ON public.webhook_events(stripe_event_created);
CREATE INDEX idx_webhook_events_object_id ON public.webhook_events(object_id);
CREATE INDEX idx_webhook_events_event_type_object_id ON public.webhook_events(event_type, object_id);
CREATE INDEX idx_webhook_events_account_event_object ON public.webhook_events(stripe_account_id, event_type, object_id);

-- Attendances テーブル関連
CREATE INDEX idx_attendances_guest_token_active ON public.attendances (guest_token) WHERE guest_token IS NOT NULL AND guest_token ~ '^gst_[a-zA-Z0-9_-]{32}$';
CREATE INDEX idx_attendances_event_id_guest_token ON public.attendances (event_id, guest_token) WHERE guest_token IS NOT NULL AND guest_token ~ '^gst_[a-zA-Z0-9_-]{32}$';
CREATE INDEX idx_attendances_event_id_id ON public.attendances (event_id, id);

-- イベントの期限チェック用
CREATE INDEX idx_events_deadlines ON public.events (registration_deadline, payment_deadline, date) WHERE registration_deadline IS NOT NULL OR payment_deadline IS NOT NULL;

-- Scheduler Locks
CREATE INDEX idx_scheduler_locks_expires_at ON public.scheduler_locks (expires_at);

-- Payout Scheduler Logs
CREATE INDEX idx_payout_scheduler_logs_execution_id ON public.payout_scheduler_logs(execution_id);
CREATE INDEX idx_payout_scheduler_logs_start_time ON public.payout_scheduler_logs(start_time DESC);
CREATE INDEX idx_payout_scheduler_logs_success ON public.payout_scheduler_logs(start_time DESC) WHERE error_message IS NULL;
CREATE INDEX idx_payout_scheduler_logs_failed ON public.payout_scheduler_logs(start_time DESC) WHERE error_message IS NOT NULL;
CREATE INDEX idx_payout_scheduler_logs_dry_run ON public.payout_scheduler_logs(dry_run, start_time DESC);

-- セキュリティ監査関連インデックス
CREATE INDEX idx_admin_access_audit_created_at_reason ON public.admin_access_audit (created_at DESC, reason);
CREATE INDEX idx_admin_access_audit_user_id_created_at ON public.admin_access_audit (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_admin_access_audit_failed_access ON public.admin_access_audit (created_at DESC, reason) WHERE success = FALSE;

CREATE INDEX idx_guest_access_audit_token_hash_created_at ON public.guest_access_audit (guest_token_hash, created_at DESC);
CREATE INDEX idx_guest_access_audit_created_at ON public.guest_access_audit (created_at DESC) WHERE success = FALSE;
CREATE INDEX idx_guest_access_audit_attendance_id ON public.guest_access_audit (attendance_id, created_at DESC) WHERE attendance_id IS NOT NULL;
CREATE INDEX idx_guest_access_audit_event_id ON public.guest_access_audit (event_id, created_at DESC) WHERE event_id IS NOT NULL;

CREATE INDEX idx_suspicious_activity_log_created_at_severity ON public.suspicious_activity_log (created_at DESC, severity) WHERE severity IN ('HIGH', 'CRITICAL');
CREATE INDEX idx_suspicious_activity_log_activity_type ON public.suspicious_activity_log (activity_type, created_at DESC);
CREATE INDEX idx_suspicious_activity_log_uninvestigated ON public.suspicious_activity_log (created_at DESC) WHERE investigated_at IS NULL AND severity IN ('HIGH', 'CRITICAL');
CREATE INDEX idx_suspicious_activity_log_user_id ON public.suspicious_activity_log (user_id, created_at DESC) WHERE user_id IS NOT NULL;

CREATE INDEX idx_unauthorized_access_log_created_at ON public.unauthorized_access_log (created_at DESC);
CREATE INDEX idx_unauthorized_access_log_detection_method ON public.unauthorized_access_log (detection_method, created_at DESC);
CREATE INDEX idx_unauthorized_access_log_ip_address ON public.unauthorized_access_log (ip_address, created_at DESC) WHERE ip_address IS NOT NULL;
CREATE INDEX idx_unauthorized_access_log_user_id ON public.unauthorized_access_log (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_unauthorized_access_log_guest_token ON public.unauthorized_access_log (guest_token_hash, created_at DESC) WHERE guest_token_hash IS NOT NULL;

-- 一意制約・部分インデックス
CREATE UNIQUE INDEX uniq_payouts_event_generated_date_jst ON public.payouts (event_id, ((generated_at AT TIME ZONE 'Asia/Tokyo')::date));
-- removed obsolete index for processing_error

-- アクティブな送金レコードの重複防止（同一event_idに対し、アクティブ状態の送金レコードは1件まで）
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_payout_per_event
ON public.payouts(event_id)
WHERE status IN ('pending','processing','completed');

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
-- 5. 核となる関数群
-- ====================================================================

-- 最小送金金額を取得するユーティリティ関数
CREATE OR REPLACE FUNCTION public.get_min_payout_amount()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((SELECT min_payout_amount FROM public.fee_config LIMIT 1), 100);
$$;

COMMENT ON FUNCTION public.get_min_payout_amount() IS '最小送金金額（円）を返すユーティリティ関数。fee_config に設定が無い場合はデフォルト 100 円。';

-- Stripe手数料計算を一元化する関数
CREATE OR REPLACE FUNCTION public.calc_total_stripe_fee(
    p_event_id   UUID,
    p_base_rate  NUMERIC DEFAULT NULL,
    p_fixed_fee  INTEGER DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_rate   NUMERIC := COALESCE(p_base_rate,  (SELECT stripe_base_rate  FROM public.fee_config LIMIT 1), 0.036);
    v_fixed  INTEGER := COALESCE(p_fixed_fee,  (SELECT stripe_fixed_fee FROM public.fee_config LIMIT 1), 0);
    v_total_fee INTEGER;
BEGIN
    SELECT COALESCE(SUM(ROUND(p.amount * v_rate + v_fixed)), 0)::INT
      INTO v_total_fee
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    RETURN v_total_fee;
END;
$$;

COMMENT ON FUNCTION public.calc_total_stripe_fee(UUID, NUMERIC, INTEGER) IS 'イベント単位で Stripe 手数料を合計計算（割合 + 固定額を 1 決済毎に丸めて合算）';

-- イベント単位でのアプリケーション手数料集計関数
CREATE OR REPLACE FUNCTION public.calc_total_application_fee(
    p_event_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_fee INTEGER;
BEGIN
    SELECT COALESCE(SUM(p.application_fee_amount), 0)::INT
    INTO   v_total_fee
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status = 'paid';

    RETURN v_total_fee;
END;
$$;

COMMENT ON FUNCTION public.calc_total_application_fee(UUID) IS 'イベント単位でアプリケーション手数料（プラットフォーム手数料）を合計計算';

-- イベント単位での返金・異議集計関数
CREATE OR REPLACE FUNCTION public.calc_refund_dispute_summary(
    p_event_id UUID
) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_refunded_amount INTEGER := 0;
    v_refunded_count INTEGER := 0;
    v_total_app_fee_refunded INTEGER := 0;
    v_result JSON;
BEGIN
    -- 返金データの集計
    SELECT
        COALESCE(SUM(p.refunded_amount), 0)::INT,
        COUNT(*)::INT,
        COALESCE(SUM(p.application_fee_refunded_amount), 0)::INT
    INTO
        v_total_refunded_amount,
        v_refunded_count,
        v_total_app_fee_refunded
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.refunded_amount > 0;

    -- JSON形式で結果を返す
    v_result := json_build_object(
        'totalRefundedAmount', v_total_refunded_amount,
        'refundedCount', v_refunded_count,
        'totalApplicationFeeRefunded', v_total_app_fee_refunded,
        'totalDisputedAmount', 0,  -- TODO: 将来的にDispute対応時に実装
        'disputeCount', 0         -- TODO: 将来的にDispute対応時に実装
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calc_refund_dispute_summary(UUID) IS 'イベント単位での返金・異議情報をJSON形式で集計';

-- Settlement aggregations RPC function
CREATE OR REPLACE FUNCTION public.get_settlement_aggregations(p_event_id UUID)
RETURNS TABLE(
  total_stripe_sales BIGINT,
  payment_count BIGINT,
  total_application_fee BIGINT,
  avg_application_fee NUMERIC,
  total_refunded_amount BIGINT,
  refunded_count BIGINT,
  total_application_fee_refunded BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH payment_data AS (
    SELECT
      p.amount,
      p.application_fee_amount,
      p.refunded_amount,
      p.application_fee_refunded_amount
    FROM public.payments p
    INNER JOIN public.attendances a ON a.id = p.attendance_id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status = 'paid'
  ),
  sales_agg AS (
    SELECT
      COALESCE(SUM(amount), 0) as total_sales,
      COUNT(*) as payment_cnt
    FROM payment_data
  ),
  fee_agg AS (
    SELECT
      COALESCE(SUM(application_fee_amount), 0) as total_fee,
      CASE
        WHEN COUNT(*) > 0 THEN AVG(application_fee_amount)
        ELSE 0
      END as avg_fee
    FROM payment_data
  ),
  refund_agg AS (
    SELECT
      COALESCE(SUM(refunded_amount), 0) as total_refund,
      COUNT(*) FILTER (WHERE refunded_amount > 0) as refund_cnt,
      COALESCE(SUM(application_fee_refunded_amount), 0) as total_fee_refund
    FROM payment_data
  )
  SELECT
    sales_agg.total_sales::BIGINT,
    sales_agg.payment_cnt::BIGINT,
    fee_agg.total_fee::BIGINT,
    fee_agg.avg_fee::NUMERIC,
    refund_agg.total_refund::BIGINT,
    refund_agg.refund_cnt::BIGINT,
    refund_agg.total_fee_refund::BIGINT
  FROM sales_agg
  CROSS JOIN fee_agg
  CROSS JOIN refund_agg;
END;
$$;

COMMENT ON FUNCTION public.get_settlement_aggregations(UUID) IS 'Aggregates settlement data for a given event efficiently in a single DB query. Returns Stripe sales, application fees, and refund totals with counts. Optimized to replace multiple JS reduce operations and reduce network overhead.';

-- 単一イベントの送金金額を集約して返す RPC
CREATE OR REPLACE FUNCTION public.calc_payout_amount(
  p_event_id UUID
) RETURNS TABLE (
  total_stripe_sales INTEGER,
  total_stripe_fee INTEGER,
  platform_fee INTEGER,
  net_payout_amount INTEGER,
  stripe_payment_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid'), 0)::INT AS total_stripe_sales,
    public.calc_total_stripe_fee(p_event_id)::INT                                   AS total_stripe_fee,
    0::INT                                                                    AS platform_fee,
    (COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid'), 0)
      - public.calc_total_stripe_fee(p_event_id))::INT                               AS net_payout_amount,
    COUNT(p.id) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid')      AS stripe_payment_count
  FROM public.attendances a
  LEFT JOIN public.payments p ON p.attendance_id = a.id
  WHERE a.event_id = p_event_id;
END;
$$;

COMMENT ON FUNCTION public.calc_payout_amount(UUID) IS '指定イベントのStripe売上・手数料・純送金額を一括計算して返す。';

-- Payment status rank function for preventing rollback
CREATE OR REPLACE FUNCTION public.status_rank(p public.payment_status_enum)
RETURNS INT AS $$
  SELECT CASE p
    WHEN 'pending'   THEN 10
    WHEN 'failed'    THEN 15
    WHEN 'paid'      THEN 20
    WHEN 'received'  THEN 25
    WHEN 'waived'    THEN 28
    WHEN 'completed' THEN 30
    WHEN 'refunded'  THEN 40
    ELSE 0
  END;
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

COMMENT ON FUNCTION public.status_rank(public.payment_status_enum) IS 'Returns precedence rank of payment statuses. Higher is more terminal (prevents rollback).';

-- Enum型の値を取得するヘルパー関数
CREATE OR REPLACE FUNCTION public.get_enum_values(enum_name TEXT)
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
    SELECT array_agg(enumlabel ORDER BY enumlabel)
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = enum_name;
$$;

COMMENT ON FUNCTION public.get_enum_values(TEXT) IS 'Enum型の値一覧を取得するヘルパー関数（CI用）';

-- 全Enum型の一覧取得
CREATE OR REPLACE FUNCTION public.list_all_enums()
RETURNS TABLE(
    enum_name TEXT,
    enum_values TEXT[]
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        t.typname AS enum_name,
        array_agg(e.enumlabel ORDER BY e.enumlabel) AS enum_values
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
$$;

COMMENT ON FUNCTION public.list_all_enums() IS '全Enum型とその値を一覧表示（開発用）';

-- ゲストトークンをSHA-256でハッシュ化する関数
CREATE OR REPLACE FUNCTION public.hash_guest_token(token TEXT)
RETURNS VARCHAR(64)
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN encode(digest(token, 'sha256'), 'hex');
END;
$$;

COMMENT ON FUNCTION public.hash_guest_token(TEXT) IS 'ゲストトークンをSHA-256でハッシュ化する関数（監査ログ用）';

-- Continued in next part...
COMMIT;
