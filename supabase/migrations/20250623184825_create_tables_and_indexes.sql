-- =======================
-- テーブル作成
-- =======================

-- usersテーブル
CREATE TABLE public.users (
    id uuid PRIMARY KEY NOT NULL,
    email character varying(255) UNIQUE NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT users_name_check CHECK (LENGTH(TRIM(name)) >= 1),
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- eventsテーブル
CREATE TABLE public.events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
    created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title character varying(200) NOT NULL,
    date timestamp with time zone NOT NULL,
    location character varying(200),
    fee integer NOT NULL,
    capacity integer,
    description text,
    registration_deadline timestamp with time zone,
    payment_deadline timestamp with time zone,
    payment_methods payment_method_enum[] NOT NULL,
    invite_token character varying(32) UNIQUE NOT NULL,
    status event_status_enum DEFAULT 'upcoming' NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    -- データ整合性制約
    CONSTRAINT events_fee_check CHECK (fee >= 0),
    CONSTRAINT events_capacity_check CHECK (capacity IS NULL OR capacity > 0),
    CONSTRAINT events_date_check CHECK (date > created_at),
    CONSTRAINT events_registration_deadline_check CHECK (registration_deadline IS NULL OR registration_deadline < date),
    CONSTRAINT events_payment_deadline_check CHECK (payment_deadline IS NULL OR payment_deadline < date),
    CONSTRAINT events_deadline_order_check CHECK (payment_deadline IS NULL OR registration_deadline IS NULL OR payment_deadline >= registration_deadline),
    CONSTRAINT events_payment_methods_check CHECK (array_length(payment_methods, 1) > 0),
    CONSTRAINT events_fee_payment_method_check CHECK (
        (fee = 0 AND 'free' = ANY(payment_methods)) OR
        (fee > 0 AND NOT ('free' = ANY(payment_methods)))
    ),
    CONSTRAINT events_invite_token_check CHECK (LENGTH(invite_token) >= 16)
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_events_created_by ON public.events USING btree (created_by);
CREATE INDEX idx_events_status ON public.events USING btree (status);
CREATE INDEX idx_events_date ON public.events USING btree (date);

-- attendancesテーブル
CREATE TABLE public.attendances (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    nickname character varying(50) NOT NULL,
    email character varying(255),
    status attendance_status_enum NOT NULL,
    guest_token character varying(32) UNIQUE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    -- データ整合性制約
    CONSTRAINT attendances_nickname_check CHECK (LENGTH(TRIM(nickname)) >= 1),
    CONSTRAINT attendances_email_check CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT attendances_guest_token_check CHECK (guest_token IS NULL OR LENGTH(guest_token) >= 16)
);
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attendances_event_id ON public.attendances USING btree (event_id);
CREATE INDEX idx_attendances_status ON public.attendances USING btree (status);
CREATE UNIQUE INDEX idx_attendances_event_email ON public.attendances USING btree (event_id, email) WHERE email IS NOT NULL;

-- paymentsテーブル
CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
    attendance_id uuid UNIQUE NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
    method payment_method_enum NOT NULL,
    amount integer NOT NULL,
    status payment_status_enum NOT NULL,
    stripe_payment_intent_id character varying(255) UNIQUE,
    webhook_event_id character varying(100),
    webhook_processed_at timestamp with time zone,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    -- データ整合性制約
    CONSTRAINT payments_amount_check CHECK (amount >= 0),
    CONSTRAINT payments_stripe_required_check CHECK (
        (method = 'stripe' AND stripe_payment_intent_id IS NOT NULL) OR
        (method != 'stripe' AND stripe_payment_intent_id IS NULL)
    ),
    CONSTRAINT payments_free_amount_check CHECK (
        (method = 'free' AND amount = 0) OR
        (method != 'free' AND amount > 0)
    ),
    CONSTRAINT payments_paid_at_check CHECK (
        (status IN ('paid', 'received', 'completed') AND paid_at IS NOT NULL) OR
        (status NOT IN ('paid', 'received', 'completed'))
    )
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payments_method_status ON public.payments USING btree (method, status);
CREATE INDEX idx_payments_stripe_payment_intent_id ON public.payments USING btree (stripe_payment_intent_id) WHERE method = 'stripe';
-- 冪等性保証のための一意制約（Stripe Webhook重複処理防止）
CREATE UNIQUE INDEX idx_payments_webhook_event_id ON public.payments USING btree (webhook_event_id) WHERE method = 'stripe' AND webhook_event_id IS NOT NULL;

-- stripe_connect_accountsテーブル
CREATE TABLE public.stripe_connect_accounts (
    user_id uuid PRIMARY KEY NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stripe_account_id character varying(255) UNIQUE NOT NULL,
    status stripe_account_status_enum DEFAULT 'unverified' NOT NULL,
    charges_enabled boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

-- payoutsテーブル
CREATE TABLE public.payouts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    total_stripe_sales integer NOT NULL,
    total_stripe_fee integer NOT NULL,
    platform_fee integer NOT NULL,
    net_payout_amount integer NOT NULL,
    status payout_status_enum DEFAULT 'pending' NOT NULL,
    stripe_transfer_id character varying(255) UNIQUE,
    webhook_event_id character varying(100),
    webhook_processed_at timestamp with time zone,
    processed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    -- データ整合性制約
    CONSTRAINT payouts_total_stripe_sales_check CHECK (total_stripe_sales >= 0),
    CONSTRAINT payouts_total_stripe_fee_check CHECK (total_stripe_fee >= 0),
    CONSTRAINT payouts_platform_fee_check CHECK (platform_fee >= 0),
    CONSTRAINT payouts_net_amount_check CHECK (net_payout_amount = total_stripe_sales - total_stripe_fee - platform_fee),
    CONSTRAINT payouts_processed_at_check CHECK (
        (status = 'completed' AND processed_at IS NOT NULL) OR
        (status != 'completed')
    )
);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payouts_event_id ON public.payouts USING btree (event_id);
CREATE INDEX idx_payouts_user_id ON public.payouts USING btree (user_id);
CREATE INDEX idx_payouts_status ON public.payouts USING btree (status);
-- 冪等性保証のための一意制約（Stripe Webhook重複処理防止）
CREATE UNIQUE INDEX idx_payouts_webhook_event_id ON public.payouts USING btree (webhook_event_id) WHERE webhook_event_id IS NOT NULL;
