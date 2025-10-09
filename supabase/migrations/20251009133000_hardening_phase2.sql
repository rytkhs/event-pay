-- Phase 2 Hardening: Revoke PUBLIC EXECUTE on functions and add critical indexes

BEGIN;

-- 1) Revoke PUBLIC execute on existing and future functions in public schema
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE app_definer IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres   IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 1.a) Re-grant minimal EXECUTE for helper functions used by RLS policies
-- NOTE: Functions referenced in RLS policies must remain callable by querying roles
GRANT EXECUTE ON FUNCTION public.get_guest_token() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_event(uuid) TO anon, authenticated;

-- 2) Add recommended indexes
-- 2.a) Enforce uniqueness of non-null invite tokens for events
CREATE UNIQUE INDEX IF NOT EXISTS events_invite_token_unique
  ON public.events (invite_token)
  WHERE invite_token IS NOT NULL;

-- 2.b) Optimize lookups for organizer connect accounts
CREATE INDEX IF NOT EXISTS stripe_connect_accounts_user_id_idx
  ON public.stripe_connect_accounts (user_id);

COMMIT;
