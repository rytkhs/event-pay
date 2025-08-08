-- Webhook処理の冪等性を保証するためのテーブル
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processing_result JSONB,
    processed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),

    -- ユニーク制約
    CONSTRAINT webhook_events_stripe_event_id_unique UNIQUE (stripe_event_id)
);

CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed_at ON webhook_events(processed_at);

-- RLSポリシー（管理者のみアクセス可能）
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_admin_only" ON webhook_events
    FOR ALL TO authenticated
    USING (false); -- 通常のユーザーはアクセス不可

-- サービスロールのみアクセス可能
CREATE POLICY "webhook_events_service_role" ON webhook_events
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- コメント
COMMENT ON TABLE webhook_events IS 'Webhook処理の冪等性を保証するためのイベント記録テーブル';
COMMENT ON COLUMN webhook_events.stripe_event_id IS 'StripeのWebhookイベントID（一意制約）';
COMMENT ON COLUMN webhook_events.event_type IS 'Webhookイベントのタイプ';
COMMENT ON COLUMN webhook_events.processing_result IS '処理結果のJSON';
COMMENT ON COLUMN webhook_events.processed_at IS '処理完了日時';
