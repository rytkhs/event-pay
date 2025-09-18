-- Remove the old incorrect constraint
alter table "public"."settlements" drop constraint if exists "payouts_calculation_valid";

-- Add the new reasonable constraint
alter table "public"."settlements" add constraint "payouts_calculation_reasonable" CHECK (((net_payout_amount <= total_stripe_sales) AND (net_payout_amount >= 0))) not valid;

alter table "public"."settlements" validate constraint "payouts_calculation_reasonable";
