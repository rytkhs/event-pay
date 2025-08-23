-- Add precise fee fields to payments for Destination charges
BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_fee INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_net INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_fee_details JSONB;

CREATE INDEX IF NOT EXISTS idx_payments_balance_txn_fee ON public.payments (stripe_balance_transaction_fee);
CREATE INDEX IF NOT EXISTS idx_payments_balance_txn_net ON public.payments (stripe_balance_transaction_net);

COMMIT;
