CREATE TABLE IF NOT EXISTS public.webhook_event_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_event_id text NOT NULL,
    event_type text NOT NULL,
    stripe_object_id text,
    dedupe_key text NOT NULL,
    processing_status text NOT NULL DEFAULT 'processing',
    last_error_code text,
    last_error_reason text,
    is_terminal_failure boolean DEFAULT false NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_event_ledger_pkey PRIMARY KEY (id),
    CONSTRAINT webhook_event_ledger_stripe_event_id_key UNIQUE (stripe_event_id),
    CONSTRAINT webhook_event_ledger_processing_status_check
      CHECK (processing_status IN ('processing', 'succeeded', 'failed'))
);

ALTER TABLE ONLY public.webhook_event_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.webhook_event_ledger FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage webhook event ledger"
  ON public.webhook_event_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.webhook_event_ledger IS 'Stripe Webhook event.id 単位の冪等性 ledger';
COMMENT ON COLUMN public.webhook_event_ledger.stripe_event_id IS 'Stripe Event ID（一次重複判定キー）';
COMMENT ON COLUMN public.webhook_event_ledger.dedupe_key IS 'event.type + data.object.id の観測用キー';
COMMENT ON COLUMN public.webhook_event_ledger.processing_status IS 'webhook処理状態（processing/succeeded/failed）';

CREATE INDEX IF NOT EXISTS idx_webhook_event_ledger_dedupe_key
    ON public.webhook_event_ledger USING btree (dedupe_key);

CREATE INDEX IF NOT EXISTS idx_webhook_event_ledger_created_at
    ON public.webhook_event_ledger USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_event_ledger_status_created_at
    ON public.webhook_event_ledger USING btree (processing_status, created_at DESC);
