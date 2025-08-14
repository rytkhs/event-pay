-- calc_payout_amount.sql : 単一イベントの送金金額を集約して返す RPC

BEGIN;

CREATE OR REPLACE FUNCTION calc_payout_amount(
  p_event_id UUID
) RETURNS TABLE (
  total_stripe_sales INTEGER,
  total_stripe_fee INTEGER,
  platform_fee INTEGER,
  net_payout_amount INTEGER,
  stripe_payment_count INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid'), 0)::INT AS total_stripe_sales,
    calc_total_stripe_fee(p_event_id)::INT                                   AS total_stripe_fee,
    0::INT                                                                    AS platform_fee,
    (COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid'), 0)
      - calc_total_stripe_fee(p_event_id))::INT                               AS net_payout_amount,
    COUNT(p.id) FILTER (WHERE p.method = 'stripe' AND p.status = 'paid')      AS stripe_payment_count
  FROM public.attendances a
  LEFT JOIN public.payments p ON p.attendance_id = a.id
  WHERE a.event_id = p_event_id;
END;
$$;

COMMENT ON FUNCTION calc_payout_amount(UUID)
  IS '指定イベントのStripe売上・手数料・純送金額を一括計算して返す。';

COMMIT;
