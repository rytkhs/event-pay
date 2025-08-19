-- Settlement aggregations RPC function for performance optimization
-- Replaces multiple JS reduce operations with single DB aggregation

CREATE OR REPLACE FUNCTION get_settlement_aggregations(p_event_id UUID)
RETURNS TABLE(
  -- Stripe sales aggregation
  total_stripe_sales BIGINT,
  payment_count BIGINT,

  -- Application fee aggregation
  total_application_fee BIGINT,
  avg_application_fee NUMERIC,

  -- Refunds and disputes aggregation
  total_refunded_amount BIGINT,
  refunded_count BIGINT,
  total_application_fee_refunded BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH payment_data AS (
    SELECT
      p.amount,
      p.application_fee_amount,
      p.refunded_amount,
      p.application_fee_refunded_amount
    FROM payments p
    INNER JOIN attendances a ON a.id = p.attendance_id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status = 'paid'
  ),
  sales_agg AS (
    SELECT
      COALESCE(SUM(amount), 0) as total_sales,
      COUNT(*) as payment_cnt
    FROM payment_data
  ),
  fee_agg AS (
    SELECT
      COALESCE(SUM(application_fee_amount), 0) as total_fee,
      CASE
        WHEN COUNT(*) > 0 THEN AVG(application_fee_amount)
        ELSE 0
      END as avg_fee
    FROM payment_data
  ),
  refund_agg AS (
    SELECT
      COALESCE(SUM(refunded_amount), 0) as total_refund,
      COUNT(*) FILTER (WHERE refunded_amount > 0) as refund_cnt,
      COALESCE(SUM(application_fee_refunded_amount), 0) as total_fee_refund
    FROM payment_data
  )
  SELECT
    sales_agg.total_sales::BIGINT,
    sales_agg.payment_cnt::BIGINT,
    fee_agg.total_fee::BIGINT,
    fee_agg.avg_fee::NUMERIC,
    refund_agg.total_refund::BIGINT,
    refund_agg.refund_cnt::BIGINT,
    refund_agg.total_fee_refund::BIGINT
  FROM sales_agg
  CROSS JOIN fee_agg
  CROSS JOIN refund_agg;
END;
$$;

-- Performance indexes for the aggregation query
-- Index for payments filtering by method and status
CREATE INDEX IF NOT EXISTS idx_payments_method_status_paid
ON payments (method, status)
WHERE method = 'stripe' AND status = 'paid';

-- Index for refunded payments
CREATE INDEX IF NOT EXISTS idx_payments_refunded_amount
ON payments (refunded_amount)
WHERE refunded_amount > 0;

-- Composite index for attendances join
CREATE INDEX IF NOT EXISTS idx_attendances_event_id_id
ON attendances (event_id, id);

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_settlement_aggregations(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_settlement_aggregations(UUID) IS
'Aggregates settlement data for a given event efficiently in a single DB query.
Returns Stripe sales, application fees, and refund totals with counts.
Optimized to replace multiple JS reduce operations and reduce network overhead.';
