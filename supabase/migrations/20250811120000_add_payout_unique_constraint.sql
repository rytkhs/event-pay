-- ====================================================================
-- 送金処理の重複防止: DB制約とロック強化
-- ====================================================================

-- 1. payoutsテーブルにアクティブ状態での一意制約を追加
-- pending, processing, completed状態のレコードが同一event_idで重複しないよう部分インデックスを作成
CREATE UNIQUE INDEX uniq_payouts_event_active
    ON public.payouts(event_id)
    WHERE status IN ('pending', 'processing', 'completed');

-- インデックスにコメントを追加
COMMENT ON INDEX uniq_payouts_event_active IS 'アクティブ状態（pending/processing/completed）の送金レコードの重複を防ぐ一意制約';

-- 2. transfer_groupフィールドを追加（既存のマイグレーションで追加済みの場合はスキップ）
-- このフィールドはStripeの冪等性キー生成に使用
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'payouts'
        AND column_name = 'transfer_group'
    ) THEN
        ALTER TABLE public.payouts ADD COLUMN transfer_group VARCHAR(255);
        COMMENT ON COLUMN public.payouts.transfer_group IS 'Stripe Transfer Group（冪等性確保用）';
    END IF;
END $$;
