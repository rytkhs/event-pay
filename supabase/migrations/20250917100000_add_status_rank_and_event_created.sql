-- ====================================================================
-- Add status_rank() function and prevent status rollback on payments
-- Add stripe_event_created column to webhook_events for FIFO ordering
-- ====================================================================

-- 1) status_rank for payment_status_enum
DO $$ BEGIN
  PERFORM 1 FROM pg_type WHERE typname = 'payment_status_enum' AND typnamespace = 'public'::regnamespace;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_status_enum does not exist. Ensure base schema migration ran before this migration.';
  END IF;
END $$;

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

-- 2) Prevent status rollback trigger on payments table
CREATE OR REPLACE FUNCTION public.prevent_payment_status_rollback()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF public.status_rank(NEW.status) < public.status_rank(OLD.status) THEN
      RAISE EXCEPTION 'Rejecting status rollback: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_payment_status_rollback'
  ) THEN
    CREATE TRIGGER trg_prevent_payment_status_rollback
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_payment_status_rollback();
  END IF;
END $$;

-- 3) Add stripe_event_created to webhook_events (epoch seconds from Stripe event.created)
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS stripe_event_created BIGINT;

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_created
  ON public.webhook_events(stripe_event_created);

COMMENT ON COLUMN public.webhook_events.stripe_event_created IS 'Stripe event.created (epoch seconds). Used for FIFO ordering to reduce out-of-order processing.';

DO $$ BEGIN
  RAISE NOTICE '✅ Added status_rank(), payments rollback guard trigger, and webhook_events.stripe_event_created.';
END $$;
