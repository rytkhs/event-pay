-- Align physical auth.users deletion with the demo cleanup contract.

ALTER TABLE ONLY public.events
  DROP CONSTRAINT IF EXISTS events_community_id_fkey;

ALTER TABLE ONLY public.events
  ADD CONSTRAINT events_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.events
  DROP CONSTRAINT IF EXISTS events_payout_profile_id_fkey;

ALTER TABLE ONLY public.events
  ADD CONSTRAINT events_payout_profile_id_fkey
  FOREIGN KEY (payout_profile_id) REFERENCES public.payout_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payments
  DROP CONSTRAINT IF EXISTS payments_payout_profile_id_fkey;

ALTER TABLE ONLY public.payments
  ADD CONSTRAINT payments_payout_profile_id_fkey
  FOREIGN KEY (payout_profile_id) REFERENCES public.payout_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payout_requests
  DROP CONSTRAINT IF EXISTS payout_requests_payout_profile_id_fkey;

ALTER TABLE ONLY public.payout_requests
  ADD CONSTRAINT payout_requests_payout_profile_id_fkey
  FOREIGN KEY (payout_profile_id) REFERENCES public.payout_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payout_requests
  DROP CONSTRAINT IF EXISTS payout_requests_community_id_fkey;

ALTER TABLE ONLY public.payout_requests
  ADD CONSTRAINT payout_requests_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payout_requests
  DROP CONSTRAINT IF EXISTS payout_requests_requested_by_fkey;

ALTER TABLE ONLY public.payout_requests
  ADD CONSTRAINT payout_requests_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE CASCADE;
