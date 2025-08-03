-- Relax the payments_stripe_intent_required constraint to allow pending Stripe payments
-- without immediate payment intent creation (for email-based payment flow)

-- Drop the existing constraint
ALTER TABLE public.payments DROP CONSTRAINT payments_stripe_intent_required;

-- Add the new relaxed constraint that allows stripe payments without payment_intent_id
-- when status is 'pending' (for initial registration)
ALTER TABLE public.payments ADD CONSTRAINT payments_stripe_intent_required
CHECK (
  (method = 'stripe' AND status = 'pending') OR
  (method = 'stripe' AND status != 'pending' AND stripe_payment_intent_id IS NOT NULL) OR
  (method != 'stripe')
);
