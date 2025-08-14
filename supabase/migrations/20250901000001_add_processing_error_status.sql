-- 送金ステータスにprocessing_errorを追加
-- Transfer成功後のDB更新失敗時に使用する中間ステータス

-- 既存のenumにprocessing_errorを追加
ALTER TYPE public.payout_status_enum ADD VALUE 'processing_error';

-- 新しいステータスの説明をコメントとして追加
COMMENT ON TYPE public.payout_status_enum IS 'Payout status: pending (初期), processing (送金中), completed (完了), failed (失敗), processing_error (送金成功・DB更新失敗)';
