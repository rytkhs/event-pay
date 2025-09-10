-- Migration: Drop legacy webhook_events table and related policies/indexes
-- Reason: Migrated to Upstash QStash; app no longer uses webhook_events

BEGIN;

-- Drop RLS policies if exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'webhook_events' AND policyname = 'webhook_events_admin_only'
  ) THEN
    EXECUTE 'DROP POLICY "webhook_events_admin_only" ON public.webhook_events';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'webhook_events' AND policyname = 'webhook_events_service_role'
  ) THEN
    EXECUTE 'DROP POLICY "webhook_events_service_role" ON public.webhook_events';
  END IF;
END $$;

-- Drop indexes (if any remain explicitly named)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_event_type') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_event_type';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_processed_at') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_processed_at';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_stripe_account_id') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_stripe_account_id';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_account_event') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_account_event';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_status') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_status';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_failed_only') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_failed_only';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_dead_only') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_dead_only';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_event_created') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_event_created';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_object_id') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_object_id';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_event_type_object_id') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_event_type_object_id';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_webhook_events_account_event_object') THEN
    EXECUTE 'DROP INDEX IF EXISTS public.idx_webhook_events_account_event_object';
  END IF;
END $$;

-- Drop table
DROP TABLE IF EXISTS public.webhook_events CASCADE;

COMMIT;
