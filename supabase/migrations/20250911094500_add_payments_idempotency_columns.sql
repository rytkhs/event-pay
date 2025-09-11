-- Add idempotency-related columns to payments
-- - checkout_idempotency_key: 保存したIdempotency-Key（Checkout Session作成用）
-- - checkout_key_revision: キー改訂番号（リクエストボディ差分が出る場合のみインクリメント）

BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS checkout_key_revision INTEGER NOT NULL DEFAULT 0;

-- 索引（検索・監査用）。キーの重複自体はStripe側で許容されるためUNIQUEにはしない。
CREATE INDEX IF NOT EXISTS idx_payments_checkout_idempotency_key
  ON public.payments (checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;

COMMIT;
