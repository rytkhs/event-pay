-- ====================================================================
-- payouts: 部分一意インデックスで重複送金を防止
--   同一event_idに対し、アクティブ状態（pending/processing/completed）の
--   送金レコードは1件までに制約する
-- ====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_payout_per_event
ON public.payouts(event_id)
WHERE status IN ('pending','processing','completed');

-- 参考: 既存データで重複がある場合は事前解消が必要
--       このマイグレーションはユニーク制約違反を起こす既存データが
--       無い前提で適用される
