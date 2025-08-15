-- ====================================================================
-- Migration: Ensure payouts snapshot uniqueness & default status
-- Issue: Destination charges migration remaining tasks (#1 DB Migration)
-- Created: 2025-09-16 09:00:00
-- ====================================================================

-- 1. payouts.status デフォルトを 'completed' に固定
ALTER TABLE public.payouts
    ALTER COLUMN status SET DEFAULT 'completed';

-- 既存レコードの status を completed に更新（pending/processing などはレポート用途で completed とみなす）
UPDATE public.payouts
SET status = 'completed'
WHERE status <> 'completed';

-- 2. イベント単位・日次でのスナップショット一意性を担保
--    UNIQUE (event_id, (generated_at AT TIME ZONE 'Asia/Tokyo')::date) の式インデックスを作成。
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename  = 'payouts'
          AND indexname  = 'uniq_payouts_event_generated_date_jst'
    ) THEN
        CREATE UNIQUE INDEX uniq_payouts_event_generated_date_jst
          ON public.payouts (
            event_id,
            ((generated_at AT TIME ZONE 'Asia/Tokyo')::date)
          );
    END IF;
END $$;

-- 3. generated_at(JST日付) フィルタ用の非 UNIQUE インデックス
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename  = 'payouts'
          AND indexname  = 'idx_payouts_generated_date_jst'
    ) THEN
        CREATE INDEX idx_payouts_generated_date_jst
          ON public.payouts (
            ((generated_at AT TIME ZONE 'Asia/Tokyo')::date)
          );
    END IF;
END $$;

-- 4. 完了通知
DO $$ BEGIN
    RAISE NOTICE '✅ Migration payouts_uniqueness_and_defaults applied: payouts.status default completed, uniqueness enforced.';
END $$;
