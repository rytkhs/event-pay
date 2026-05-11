CREATE TYPE public.payout_request_status AS ENUM (
  'requesting',
  'created',
  'paid',
  'failed',
  'canceled',
  'creation_unknown'
);

CREATE TABLE public.payout_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payout_profile_id uuid NOT NULL,
  community_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  stripe_account_id character varying(255) NOT NULL,
  stripe_payout_id character varying(255),
  amount integer NOT NULL,
  currency text DEFAULT 'jpy'::text NOT NULL,
  status public.payout_request_status DEFAULT 'requesting'::public.payout_request_status NOT NULL,
  idempotency_key text NOT NULL,
  arrival_date timestamp with time zone,
  stripe_created_at timestamp with time zone,
  failure_code text,
  failure_message text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT payout_requests_pkey PRIMARY KEY (id),
  CONSTRAINT payout_requests_amount_positive CHECK (amount > 0),
  CONSTRAINT payout_requests_currency_jpy CHECK (currency = 'jpy'::text),
  CONSTRAINT payout_requests_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT payout_requests_stripe_payout_id_key UNIQUE (stripe_payout_id),
  CONSTRAINT payout_requests_payout_profile_id_fkey
    FOREIGN KEY (payout_profile_id) REFERENCES public.payout_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT payout_requests_community_id_fkey
    FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE RESTRICT,
  CONSTRAINT payout_requests_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE RESTRICT
);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.payout_requests IS 'アプリ内から実行したStripe connected accountの入金リクエスト履歴';
COMMENT ON COLUMN public.payout_requests.amount IS 'JPY最小通貨単位。JPYでは円単位';
COMMENT ON COLUMN public.payout_requests.status IS 'Stripe payout作成から入金完了・失敗までのアプリ内追跡ステータス';
COMMENT ON COLUMN public.payout_requests.idempotency_key IS 'Stripe payout作成時のIdempotency-Key';

CREATE INDEX idx_payout_requests_payout_profile_id
  ON public.payout_requests USING btree (payout_profile_id);
CREATE INDEX idx_payout_requests_requested_by
  ON public.payout_requests USING btree (requested_by);
CREATE INDEX idx_payout_requests_community_id
  ON public.payout_requests USING btree (community_id);
CREATE INDEX idx_payout_requests_stripe_account_id
  ON public.payout_requests USING btree (stripe_account_id);
CREATE INDEX idx_payout_requests_status
  ON public.payout_requests USING btree (status);
CREATE INDEX idx_payout_requests_requested_at
  ON public.payout_requests USING btree (requested_at DESC);

CREATE TRIGGER update_payout_requests_updated_at
BEFORE UPDATE ON public.payout_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON TABLE public.payout_requests TO authenticated;
GRANT ALL ON TABLE public.payout_requests TO service_role;

CREATE POLICY "Owners can view own payout requests"
ON public.payout_requests
FOR SELECT
TO authenticated
USING (
  requested_by = (SELECT auth.uid())
  OR public.is_payout_profile_owner(payout_profile_id)
);

CREATE POLICY "Service role can manage payout requests"
ON public.payout_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
