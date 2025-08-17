-- ====================================================================
-- Add object_id to webhook_events for duplicate detection by object+type
-- ====================================================================

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS object_id VARCHAR(255);

-- Helpful indexes for duplicate checks and operational queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_object_id
  ON public.webhook_events(object_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type_object_id
  ON public.webhook_events(event_type, object_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_account_event_object
  ON public.webhook_events(stripe_account_id, event_type, object_id);

COMMENT ON COLUMN public.webhook_events.object_id IS 'Stripe data.object.id captured for duplicate detection across separate events of the same type.';

DO $$ BEGIN
  RAISE NOTICE '✅ Added webhook_events.object_id and related indexes';
END $$;
