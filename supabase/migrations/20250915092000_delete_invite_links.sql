-- Delete invite_links table and related RLS

BEGIN;

-- Drop RLS policies (handle both legacy and current names defensively)
DROP POLICY IF EXISTS "Anyone can view valid invite links" ON public.invite_links;
DROP POLICY IF EXISTS "Safe invite link view policy" ON public.invite_links;
DROP POLICY IF EXISTS "Safe invite link management policy" ON public.invite_links;

-- Drop trigger (updated_at maintenance)
DROP TRIGGER IF EXISTS update_invite_links_updated_at ON public.invite_links;

-- Finally drop the table
DROP TABLE IF EXISTS public.invite_links CASCADE;

COMMIT;
