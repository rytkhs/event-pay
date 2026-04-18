-- Stripe Connect の受取先状態を status 1カラムから段階的に分離する
-- - collection_ready はオンライン集金可否の暫定キャッシュ
-- - payouts_enabled は引き続き実際の出金可否として扱う

ALTER TABLE public.payout_profiles
  ADD COLUMN collection_ready boolean DEFAULT false NOT NULL,
  ADD COLUMN transfers_status text,
  ADD COLUMN requirements_disabled_reason text,
  ADD COLUMN requirements_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN stripe_status_synced_at timestamp with time zone;

COMMENT ON COLUMN public.payout_profiles.collection_ready IS 'Stripeオンライン集金可否の暫定キャッシュ。statusとは分離して管理する';
COMMENT ON COLUMN public.payout_profiles.transfers_status IS 'Stripe transfers capabilityの最新ステータスキャッシュ';
COMMENT ON COLUMN public.payout_profiles.requirements_disabled_reason IS 'Stripe requirements.disabled_reason の最新キャッシュ';
COMMENT ON COLUMN public.payout_profiles.requirements_summary IS 'Stripe requirements/capability requirements の表示・監査用サマリキャッシュ';
COMMENT ON COLUMN public.payout_profiles.stripe_status_synced_at IS 'Stripe Account状態を最後に同期した日時';

UPDATE public.payout_profiles
   SET collection_ready = true
 WHERE status = 'verified';
