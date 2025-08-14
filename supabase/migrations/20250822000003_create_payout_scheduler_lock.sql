-- 自動送金スケジューラー用アドバイザリロック関数
-- pg_try_advisory_lock で排他制御を取得し、boolean を返す

CREATE OR REPLACE FUNCTION acquire_payout_scheduler_lock()
RETURNS boolean
LANGUAGE sql
AS $$
  -- 固定キー (任意の32bit整数)。他ロックと衝突しない番号を選定
  SELECT pg_try_advisory_lock(901234);
$$;
