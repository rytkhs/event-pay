BEGIN;

-- Drop transfer reversal tracking columns (no longer needed after Destination Charges transition)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'stripe_transfer_reversal_id'
  ) THEN
    -- Drop index if it exists
    IF EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_payments_transfer_reversal_id'
    ) THEN
      EXECUTE 'DROP INDEX IF EXISTS public.idx_payments_transfer_reversal_id';
    END IF;
    ALTER TABLE public.payments DROP COLUMN stripe_transfer_reversal_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'transfer_reversed_amount'
  ) THEN
    ALTER TABLE public.payments DROP COLUMN transfer_reversed_amount;
  END IF;
END $$;

COMMIT;
