-- 自動送金スケジューラー用アドバイザリロックをトランザクションスコープに変更
-- pg_try_advisory_xact_lock はトランザクション終了時に自動でロックを解放する

-- 既存の acquire_payout_scheduler_lock を置き換え
CREATE OR REPLACE FUNCTION acquire_payout_scheduler_lock()
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_try_advisory_xact_lock(901234);
$$;

-- （任意）ロックが残存している場合に強制的に解放するユーティリティ
CREATE OR REPLACE FUNCTION force_release_payout_scheduler_lock()
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_advisory_unlock(901234);
$$;
