CREATE OR REPLACE FUNCTION acquire_payout_scheduler_lock()
RETURNS boolean
LANGUAGE sql
AS $$
  -- 固定キー(32bit整数)
  SELECT pg_try_advisory_lock(901234);
$$;
