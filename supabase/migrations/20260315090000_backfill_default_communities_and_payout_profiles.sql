CREATE OR REPLACE FUNCTION public.generate_community_slug()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
    SELECT translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
$$;

GRANT EXECUTE ON FUNCTION public.generate_community_slug() TO authenticated, service_role;

ALTER TABLE public.communities
    ALTER COLUMN slug SET DEFAULT public.generate_community_slug();

CREATE TEMP TABLE migration_candidate_community_owners ON COMMIT DROP AS
SELECT DISTINCT owner_user_id
FROM (
    SELECT e.created_by AS owner_user_id
    FROM public.events e

    UNION

    SELECT sca.user_id AS owner_user_id
    FROM public.stripe_connect_accounts sca
) owners;

INSERT INTO public.communities (
    created_by,
    name
)
SELECT
    owner.owner_user_id,
    LEFT(u.name, 248) || 'のコミュニティ'
FROM migration_candidate_community_owners owner
JOIN public.users u
    ON u.id = owner.owner_user_id
WHERE NOT EXISTS (
    SELECT 1
    FROM public.communities c
    WHERE c.created_by = owner.owner_user_id
      AND c.is_deleted = false
);

CREATE TEMP TABLE migration_owner_default_communities ON COMMIT DROP AS
SELECT
    owner.owner_user_id,
    community.id AS community_id
FROM migration_candidate_community_owners owner
JOIN LATERAL (
    SELECT c.id
    FROM public.communities c
    WHERE c.created_by = owner.owner_user_id
      AND c.is_deleted = false
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1
) community
    ON TRUE;

INSERT INTO public.payout_profiles (
    owner_user_id,
    stripe_account_id,
    status,
    charges_enabled,
    payouts_enabled
)
SELECT
    sca.user_id,
    sca.stripe_account_id,
    sca.status,
    sca.charges_enabled,
    sca.payouts_enabled
FROM public.stripe_connect_accounts sca
ON CONFLICT ON CONSTRAINT payout_profiles_owner_user_id_key
DO UPDATE
SET
    stripe_account_id = EXCLUDED.stripe_account_id,
    status = EXCLUDED.status,
    charges_enabled = EXCLUDED.charges_enabled,
    payouts_enabled = EXCLUDED.payouts_enabled,
    updated_at = NOW();

UPDATE public.payout_profiles pp
SET representative_community_id = odc.community_id
FROM migration_owner_default_communities odc
WHERE pp.owner_user_id = odc.owner_user_id
  AND pp.representative_community_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM public.stripe_connect_accounts sca
      WHERE sca.user_id = odc.owner_user_id
  );

UPDATE public.communities c
SET current_payout_profile_id = pp.id
FROM public.payout_profiles pp
WHERE c.created_by = pp.owner_user_id
  AND c.current_payout_profile_id IS NULL;
