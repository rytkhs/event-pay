CREATE TYPE public.payout_system_fee_state AS ENUM (
  'not_started',
  'succeeded',
  'failed',
  'creation_unknown',
  'manual_review_required'
);

ALTER TABLE public.fee_config
ADD COLUMN payout_request_fee_amount integer DEFAULT 260 NOT NULL;

ALTER TABLE public.fee_config
ADD CONSTRAINT fee_config_payout_request_fee_amount_non_negative CHECK (payout_request_fee_amount >= 0);

COMMENT ON COLUMN public.fee_config.payout_request_fee_amount IS 'payout request 1回ごとにAccount Debitで回収する振込手数料額(円)';

ALTER TABLE public.payout_requests
ADD COLUMN gross_amount integer,
ADD COLUMN system_fee_amount integer,
ADD COLUMN system_fee_state public.payout_system_fee_state DEFAULT 'not_started'::public.payout_system_fee_state NOT NULL,
ADD COLUMN stripe_account_debit_transfer_id text,
ADD COLUMN stripe_account_debit_payment_id text,
ADD COLUMN system_fee_idempotency_key text,
ADD COLUMN system_fee_failure_code text,
ADD COLUMN system_fee_failure_message text;

UPDATE public.payout_requests
SET
  gross_amount = amount,
  system_fee_amount = 0
WHERE gross_amount IS NULL OR system_fee_amount IS NULL;

ALTER TABLE public.payout_requests
ALTER COLUMN gross_amount SET NOT NULL,
ALTER COLUMN system_fee_amount SET NOT NULL;

ALTER TABLE public.payout_requests
ADD CONSTRAINT payout_requests_gross_amount_non_negative CHECK (gross_amount >= 0),
ADD CONSTRAINT payout_requests_system_fee_amount_non_negative CHECK (system_fee_amount >= 0),
ADD CONSTRAINT payout_requests_amount_matches_system_fee CHECK (gross_amount = amount + system_fee_amount);

CREATE UNIQUE INDEX uniq_payout_requests_account_debit_payment_id
  ON public.payout_requests USING btree (stripe_account_debit_payment_id)
  WHERE stripe_account_debit_payment_id IS NOT NULL;

CREATE UNIQUE INDEX uniq_payout_requests_account_debit_transfer_id
  ON public.payout_requests USING btree (stripe_account_debit_transfer_id)
  WHERE stripe_account_debit_transfer_id IS NOT NULL;

CREATE UNIQUE INDEX uniq_payout_requests_system_fee_idempotency_key
  ON public.payout_requests USING btree (system_fee_idempotency_key)
  WHERE system_fee_idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.payout_requests.gross_amount IS 'payout request時点のconnected account振込可能残高（円）';
COMMENT ON COLUMN public.payout_requests.system_fee_amount IS 'payout request時点でスナップショットしたシステム手数料額（円）';
COMMENT ON COLUMN public.payout_requests.system_fee_state IS 'payout前に実行するAccount Debit手数料回収のアプリ内状態';
COMMENT ON COLUMN public.payout_requests.stripe_account_debit_transfer_id IS 'Account Debitによりconnected account残高からplatformへ資金移動するTransfer ID';
COMMENT ON COLUMN public.payout_requests.stripe_account_debit_payment_id IS 'Account Debit作成時にStripe APIが返すplatform側Payment ID';
COMMENT ON COLUMN public.payout_requests.system_fee_idempotency_key IS 'Account Debit作成時のStripe Idempotency-Key';
