-- PayoutScheduler実行ログテーブルの作成
-- 自動送金スケジューラーの実行履歴を記録するためのテーブル

-- payout_scheduler_logsテーブルの作成
CREATE TABLE IF NOT EXISTS payout_scheduler_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id VARCHAR(100) NOT NULL UNIQUE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    processing_time_ms INTEGER NOT NULL CHECK (processing_time_ms >= 0),
    eligible_events_count INTEGER NOT NULL DEFAULT 0 CHECK (eligible_events_count >= 0),
    successful_payouts INTEGER NOT NULL DEFAULT 0 CHECK (successful_payouts >= 0),
    failed_payouts INTEGER NOT NULL DEFAULT 0 CHECK (failed_payouts >= 0),
    total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    dry_run BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    results JSONB,
    summary JSONB,
    created_at TIMESTAMP DEFAULT now(),

    -- 制約
    CONSTRAINT valid_payout_counts CHECK (
        successful_payouts + failed_payouts <= eligible_events_count
    ),
    CONSTRAINT valid_execution_time CHECK (
        end_time >= start_time
    )
);

-- インデックス
CREATE INDEX idx_payout_scheduler_logs_execution_id ON payout_scheduler_logs(execution_id);
CREATE INDEX idx_payout_scheduler_logs_start_time ON payout_scheduler_logs(start_time DESC);
CREATE INDEX idx_payout_scheduler_logs_success ON payout_scheduler_logs(start_time DESC) WHERE error_message IS NULL;
CREATE INDEX idx_payout_scheduler_logs_failed ON payout_scheduler_logs(start_time DESC) WHERE error_message IS NOT NULL;
CREATE INDEX idx_payout_scheduler_logs_dry_run ON payout_scheduler_logs(dry_run, start_time DESC);

-- RLSポリシー（管理者のみアクセス可能）
ALTER TABLE payout_scheduler_logs ENABLE ROW LEVEL SECURITY;

-- 管理者のみ全てのログを閲覧可能
CREATE POLICY "admin_can_view_scheduler_logs" ON payout_scheduler_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.email IN (
                'admin@eventpay.com',
                'support@eventpay.com'
            )
        )
    );

-- システム（service_role）は全操作可能
CREATE POLICY "system_can_manage_scheduler_logs" ON payout_scheduler_logs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- コメント
COMMENT ON TABLE payout_scheduler_logs IS 'PayoutScheduler実行ログテーブル - 自動送金処理の実行履歴を記録';
COMMENT ON COLUMN payout_scheduler_logs.execution_id IS '実行ID（一意識別子）';
COMMENT ON COLUMN payout_scheduler_logs.start_time IS '実行開始時刻';
COMMENT ON COLUMN payout_scheduler_logs.end_time IS '実行終了時刻';
COMMENT ON COLUMN payout_scheduler_logs.processing_time_ms IS '処理時間（ミリ秒）';
COMMENT ON COLUMN payout_scheduler_logs.eligible_events_count IS '送金対象イベント数';
COMMENT ON COLUMN payout_scheduler_logs.successful_payouts IS '成功した送金数';
COMMENT ON COLUMN payout_scheduler_logs.failed_payouts IS '失敗した送金数';
COMMENT ON COLUMN payout_scheduler_logs.total_amount IS '総送金金額（円）';
COMMENT ON COLUMN payout_scheduler_logs.dry_run IS 'ドライランモードかどうか';
COMMENT ON COLUMN payout_scheduler_logs.error_message IS 'エラーメッセージ（実行失敗時）';
COMMENT ON COLUMN payout_scheduler_logs.results IS '詳細実行結果（JSON）';
COMMENT ON COLUMN payout_scheduler_logs.summary IS '実行サマリー（JSON）';

-- 古いログを自動削除するための関数（オプション）
CREATE OR REPLACE FUNCTION cleanup_old_scheduler_logs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- 指定日数より古いログを削除
    DELETE FROM payout_scheduler_logs
    WHERE start_time < (now() - (retention_days || ' days')::INTERVAL);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_scheduler_logs IS 'PayoutSchedulerの古いログを削除する関数';
