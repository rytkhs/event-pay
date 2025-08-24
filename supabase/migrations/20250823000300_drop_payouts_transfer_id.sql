BEGIN;

-- Drop column and related index if exist (Destination charges no longer uses transfer_id)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payouts' AND column_name = 'stripe_transfer_id'
  ) THEN
    -- Drop partial/normal index if exists
    IF EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_payouts_stripe_transfer'
    ) THEN
      EXECUTE 'DROP INDEX IF EXISTS public.idx_payouts_stripe_transfer';
    END IF;

    ALTER TABLE public.payouts DROP COLUMN stripe_transfer_id;
  END IF;
END $$;

COMMIT;
