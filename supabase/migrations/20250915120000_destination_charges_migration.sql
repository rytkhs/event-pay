-- ====================================================================
-- Destination charges 移行のためのDBマイグレーション
-- 目的: SeparateCharges & Transfers から Destination charges への移行
-- ====================================================================

-- 1. ENUMの追加
-- settlement_mode_enum: 送金モード（レポート用）
DO $$ BEGIN
    CREATE TYPE public.settlement_mode_enum AS ENUM ('destination_charge');
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- 2. payments テーブルの拡張
-- Destination charges に必要なフィールドを追加
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS application_fee_amount INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS transfer_group VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_transfer_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS refunded_amount INTEGER NOT NULL DEFAULT 0,
    -- 監査強化フィールド
    ADD COLUMN IF NOT EXISTS application_fee_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS application_fee_refund_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS application_fee_refunded_amount INTEGER NOT NULL DEFAULT 0;

-- stripe_account_id を destination_account_id にリネーム（意味を明確化）
-- 既存のカラムが存在する場合のみリネーム
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'payments'
               AND column_name = 'stripe_account_id'
               AND table_schema = 'public') THEN
        ALTER TABLE public.payments RENAME COLUMN stripe_account_id TO destination_account_id;
    END IF;
END $$;

-- destination_account_id が存在しない場合は追加
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS destination_account_id VARCHAR(255);

-- 3. payments テーブルのインデックス作成
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_charge_id
    ON public.payments(stripe_charge_id)
    WHERE stripe_charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_transfer_group
    ON public.payments(transfer_group);

CREATE INDEX IF NOT EXISTS idx_payments_balance_txn
    ON public.payments(stripe_balance_transaction_id);

CREATE INDEX IF NOT EXISTS idx_payments_checkout_session
    ON public.payments(stripe_checkout_session_id);

CREATE INDEX IF NOT EXISTS idx_payments_customer_id
    ON public.payments(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_payments_destination_account
    ON public.payments(destination_account_id);

-- 4. payouts テーブルの拡張（レポート用途への再定義）
ALTER TABLE public.payouts
    ADD COLUMN IF NOT EXISTS settlement_mode public.settlement_mode_enum DEFAULT 'destination_charge',
    ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS transfer_group VARCHAR(255);

-- payouts テーブルのインデックス追加
CREATE INDEX IF NOT EXISTS idx_payouts_event_generated_at
    ON public.payouts(event_id, generated_at);

CREATE INDEX IF NOT EXISTS idx_payouts_settlement_mode
    ON public.payouts(settlement_mode);

CREATE INDEX IF NOT EXISTS idx_payouts_transfer_group
    ON public.payouts(transfer_group);

-- payouts スナップショット一意性の制約
-- 同一イベント・同一日付での重複を防止
-- 関数ベースのインデックスは使用せず、アプリケーション側で制御する
-- 代わりに通常のインデックスを作成
CREATE INDEX IF NOT EXISTS idx_payouts_event_generated_at_date
    ON public.payouts(event_id, generated_at);

-- 5. webhook_events テーブルの拡張
ALTER TABLE public.webhook_events
    ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'processed',
    ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- webhook_events のインデックス追加
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_account_id
    ON public.webhook_events(stripe_account_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type
    ON public.webhook_events(event_type);

CREATE INDEX IF NOT EXISTS idx_webhook_events_account_event
    ON public.webhook_events(stripe_account_id, event_type);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status
    ON public.webhook_events(status);

-- 部分インデックス: failed / dead だけを高速に掃き出す
CREATE INDEX IF NOT EXISTS idx_webhook_events_failed_only
    ON public.webhook_events(status)
    WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_webhook_events_dead_only
    ON public.webhook_events(status)
    WHERE status = 'dead';

-- 既存レコードでリトライ回数が閾値を超えているものを dead へ
UPDATE public.webhook_events
SET status = 'dead'
WHERE status = 'failed'
  AND retry_count >= 5;

-- 6. 制約の追加
-- payments テーブルの制約
DO $$ BEGIN
    -- refunded_amount の制約
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'chk_payments_refunded_amount_non_negative'
                   AND table_name = 'payments' AND table_schema = 'public') THEN
        ALTER TABLE public.payments ADD CONSTRAINT chk_payments_refunded_amount_non_negative
            CHECK (refunded_amount >= 0);
    END IF;

    -- application_fee_amount の制約
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'chk_payments_application_fee_amount_non_negative'
                   AND table_name = 'payments' AND table_schema = 'public') THEN
        ALTER TABLE public.payments ADD CONSTRAINT chk_payments_application_fee_amount_non_negative
            CHECK (application_fee_amount >= 0);
    END IF;

    -- application_fee_refunded_amount の制約
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'chk_payments_application_fee_refunded_amount_non_negative'
                   AND table_name = 'payments' AND table_schema = 'public') THEN
        ALTER TABLE public.payments ADD CONSTRAINT chk_payments_application_fee_refunded_amount_non_negative
            CHECK (application_fee_refunded_amount >= 0);
    END IF;
END $$;

-- 7. コメントの追加
COMMENT ON COLUMN public.payments.application_fee_amount IS 'プラットフォーム手数料（円）';
COMMENT ON COLUMN public.payments.stripe_checkout_session_id IS 'Stripe Checkout Session ID';
COMMENT ON COLUMN public.payments.transfer_group IS 'イベント単位の送金グループ識別子';
COMMENT ON COLUMN public.payments.stripe_charge_id IS 'Stripe Charge ID（確定時に保存）';
COMMENT ON COLUMN public.payments.stripe_balance_transaction_id IS 'Stripe Balance Transaction ID';
COMMENT ON COLUMN public.payments.stripe_customer_id IS 'Stripe Customer ID（将来の継続課金用）';
COMMENT ON COLUMN public.payments.stripe_transfer_id IS 'Stripe Transfer ID（自動Transfer相関用）';
COMMENT ON COLUMN public.payments.refunded_amount IS '返金累積額（円）';
COMMENT ON COLUMN public.payments.destination_account_id IS 'Stripe Connect宛先アカウントID';
COMMENT ON COLUMN public.payments.application_fee_id IS 'Stripe Application Fee ID';
COMMENT ON COLUMN public.payments.application_fee_refund_id IS 'Stripe Application Fee Refund ID';
COMMENT ON COLUMN public.payments.application_fee_refunded_amount IS 'プラットフォーム手数料返金額（円）';

COMMENT ON COLUMN public.payouts.settlement_mode IS '送金モード（destination_charge固定）';
COMMENT ON COLUMN public.payouts.generated_at IS 'レポート生成日時';
COMMENT ON COLUMN public.payouts.transfer_group IS 'イベント単位の送金グループ識別子';

COMMENT ON COLUMN public.webhook_events.stripe_account_id IS 'Stripe Connect Account ID（Connect イベント相関用）';
COMMENT ON COLUMN public.webhook_events.retry_count IS 'Webhook再試行回数';
COMMENT ON COLUMN public.webhook_events.last_retry_at IS '最終再試行日時';
COMMENT ON COLUMN public.webhook_events.status IS 'Webhook処理状態（processed/failed）';
COMMENT ON COLUMN public.webhook_events.processing_error IS 'Webhook処理エラー詳細';

-- 8. RLSポリシーの更新（必要に応じて）
-- 既存のポリシーは維持し、新しいカラムに対する特別な制限は設けない

-- 9. 既存データの移行（開発段階のため実際のデータ移行は不要）
-- 本番環境では以下のような移行が必要になる可能性がある：
-- UPDATE public.payouts SET settlement_mode = 'destination_charge' WHERE settlement_mode IS NULL;

-- 10. 完了通知
DO $$ BEGIN
    RAISE NOTICE '✅ Destination charges migration completed successfully.';
    RAISE NOTICE '   - payments table extended with destination charges fields';
    RAISE NOTICE '   - payouts table converted to report/snapshot mode';
    RAISE NOTICE '   - webhook_events table extended for Connect events';
    RAISE NOTICE '   - All necessary indexes and constraints created';
END $$;
