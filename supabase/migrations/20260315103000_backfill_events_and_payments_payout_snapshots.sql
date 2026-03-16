CREATE TEMP TABLE migration_owner_default_communities ON COMMIT DROP AS
SELECT DISTINCT ON (c.created_by)
    c.created_by AS owner_user_id,
    c.id AS community_id
FROM public.communities c
WHERE c.is_deleted = false
ORDER BY c.created_by, c.created_at ASC, c.id ASC;

CREATE TEMP TABLE migration_owner_payout_profiles ON COMMIT DROP AS
SELECT
    pp.owner_user_id,
    pp.id AS payout_profile_id
FROM public.payout_profiles pp;

UPDATE public.events e
SET community_id = odc.community_id
FROM migration_owner_default_communities odc
WHERE e.created_by = odc.owner_user_id
  AND e.community_id IS NULL;

UPDATE public.events e
SET payout_profile_id = opp.payout_profile_id
FROM migration_owner_payout_profiles opp
WHERE e.created_by = opp.owner_user_id
  AND e.payout_profile_id IS NULL;

UPDATE public.payments p
SET payout_profile_id = e.payout_profile_id
FROM public.attendances a
JOIN public.events e
    ON e.id = a.event_id
WHERE p.attendance_id = a.id
  AND p.method = 'stripe'
  AND p.payout_profile_id IS NULL
  AND e.payout_profile_id IS NOT NULL;

UPDATE public.payments p
SET payout_profile_id = pp.id
FROM public.payout_profiles pp
WHERE p.method = 'stripe'
  AND p.payout_profile_id IS NULL
  AND p.stripe_account_id IS NOT NULL
  AND p.stripe_account_id = pp.stripe_account_id;

DO $$
DECLARE
    unresolved_event_count integer;
    unresolved_stripe_payment_count integer;
BEGIN
    SELECT COUNT(*)
    INTO unresolved_event_count
    FROM public.events
    WHERE community_id IS NULL;

    IF unresolved_event_count > 0 THEN
        RAISE EXCEPTION
            'CC-02-03 backfill failed: % events still have NULL community_id',
            unresolved_event_count;
    END IF;

    SELECT COUNT(*)
    INTO unresolved_stripe_payment_count
    FROM public.payments
    WHERE method = 'stripe'
      AND payout_profile_id IS NULL;

    IF unresolved_stripe_payment_count > 0 THEN
        RAISE EXCEPTION
            'CC-02-03 backfill failed: % stripe payments still have NULL payout_profile_id',
            unresolved_stripe_payment_count;
    END IF;
END
$$;
