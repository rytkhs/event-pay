-- Fix unique_open_payment_per_attendance constraint
-- Old: status IN ('pending', 'failed')
-- New: status = 'pending' only (allow multiple failed records)

BEGIN;

-- Drop the existing unique index
DROP INDEX IF EXISTS public.unique_open_payment_per_attendance;

-- Create new unique index that only includes 'pending' status
CREATE UNIQUE INDEX unique_open_payment_per_attendance
  ON public.payments (attendance_id)
  WHERE status = 'pending';

COMMIT;
