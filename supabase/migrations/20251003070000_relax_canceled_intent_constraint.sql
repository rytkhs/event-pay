-- Relax stripe_payment_intent_id constraint for canceled status
-- canceled is a terminal state for unpaid statuses (pending/failed)
-- and should not require stripe_payment_intent_id

BEGIN;

-- Drop the existing constraint
ALTER TABLE "public"."payments" DROP CONSTRAINT IF EXISTS "payments_stripe_intent_required";

-- Add the updated constraint that allows canceled status without stripe_payment_intent_id
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_stripe_intent_required"
CHECK (
  (
    -- Stripe pending: intent_id can be null
    ("method" = 'stripe'::"public"."payment_method_enum")
    AND ("status" = 'pending'::"public"."payment_status_enum")
  )
  OR
  (
    -- Stripe canceled: intent_id can be null (canceled is for unpaid statuses)
    ("method" = 'stripe'::"public"."payment_method_enum")
    AND ("status" = 'canceled'::"public"."payment_status_enum")
  )
  OR
  (
    -- Stripe other statuses: intent_id must be present
    ("method" = 'stripe'::"public"."payment_method_enum")
    AND ("status" NOT IN ('pending'::"public"."payment_status_enum", 'canceled'::"public"."payment_status_enum"))
    AND ("stripe_payment_intent_id" IS NOT NULL)
  )
  OR
  (
    -- Non-stripe: no constraint
    ("method" <> 'stripe'::"public"."payment_method_enum")
  )
);

COMMENT ON CONSTRAINT "payments_stripe_intent_required" ON "public"."payments"
IS 'Ensures stripe_payment_intent_id is present for stripe payments except pending and canceled statuses. Canceled is a terminal state for unpaid transactions.';

COMMIT;
