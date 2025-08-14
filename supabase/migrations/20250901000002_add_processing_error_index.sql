-- processing_errorステータス用のインデックス追加
-- ENUMに新しい値を追加した後、別トランザクションで実行する必要がある

-- インデックス追加（processing_errorステータスでの検索を高速化）
CREATE INDEX IF NOT EXISTS idx_payouts_status_processing_error
ON public.payouts (status)
WHERE status = 'processing_error';
