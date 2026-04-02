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
            'CC-02-05 failed: % events still have NULL community_id',
            unresolved_event_count;
    END IF;

    SELECT COUNT(*)
    INTO unresolved_stripe_payment_count
    FROM public.payments
    WHERE method = 'stripe'
      AND payout_profile_id IS NULL;

    IF unresolved_stripe_payment_count > 0 THEN
        RAISE EXCEPTION
            'CC-02-05 failed: % stripe payments still have NULL payout_profile_id',
            unresolved_stripe_payment_count;
    END IF;
END
$$;

ALTER TABLE public.events
    ALTER COLUMN community_id SET NOT NULL;

ALTER TABLE public.payments
    ADD CONSTRAINT payments_payout_profile_required_for_stripe
    CHECK (
        method <> 'stripe'::public.payment_method_enum
        OR payout_profile_id IS NOT NULL
    );
