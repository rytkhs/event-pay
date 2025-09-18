-- Enforce required deadlines policy
-- 1) registration_deadline is required (NOT NULL)
-- 2) payment_deadline is optional by default, but required when 'stripe' is selected

BEGIN;

-- Backfill registration_deadline for existing rows to satisfy NOT NULL
UPDATE public.events
SET registration_deadline = date
WHERE registration_deadline IS NULL;

-- Make registration_deadline NOT NULL
ALTER TABLE public.events
  ALTER COLUMN registration_deadline SET NOT NULL;

-- Require payment_deadline when 'stripe' is selected in payment_methods
ALTER TABLE public.events
  ADD CONSTRAINT events_payment_deadline_required_if_stripe
  CHECK (
    NOT ('stripe' = ANY (payment_methods))
    OR payment_deadline IS NOT NULL
  );

COMMIT;
