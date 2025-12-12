-- デバッグログ確認用SQLクエリ
-- ゲストトークンアクセスでRLSポリシーが正常に動作するか調査するためのクエリ

-- 1. can_access_event関数のデバッグログを確認
SELECT
    level,
    message,
    metadata->>'function' as function_name,
    metadata->>'event_id' as event_id,
    metadata->>'current_user_id' as current_user_id,
    metadata->>'guest_token_var' as guest_token_var,
    metadata->>'access_type' as access_type,
    metadata->>'auth_error' as auth_error,
    metadata->>'guest_token_error' as guest_token_error,
    created_at
FROM system_logs
WHERE
    level = 'debug'
    AND message LIKE '%can_access_event%'
ORDER BY created_at DESC
LIMIT 50;

-- 2. ゲストトークン検証のデバッグログを確認
SELECT
    level,
    message,
    metadata->>'tableName' as table_name,
    metadata->>'operationType' as operation_type,
    metadata->>'resultCount' as result_count,
    metadata->>'hasData' as has_data,
    metadata->>'hasError' as has_error,
    metadata->>'errorMessage' as error_message,
    metadata->>'errorCode' as error_code,
    created_at
FROM system_logs
WHERE
    level = 'debug'
    AND message LIKE '%Guest token%'
ORDER BY created_at DESC
LIMIT 50;

-- 3. 招待トークン検証のデバッグログを確認
SELECT
    level,
    message,
    metadata->>'tag' as tag,
    metadata->>'tokenPrefix' as token_prefix,
    metadata->>'eventId' as event_id,
    metadata->>'status' as status,
    metadata->>'canRegister' as can_register,
    created_at
FROM system_logs
WHERE
    level = 'debug'
    AND message LIKE '%Invite token%'
ORDER BY created_at DESC
LIMIT 50;

-- 4. 最近のRLS関連エラーを確認
SELECT
    level,
    message,
    metadata,
    created_at
FROM system_logs
WHERE
    (level = 'error' AND message LIKE '%RLS%')
    OR (level = 'error' AND message LIKE '%policy%')
    OR (level = 'error' AND message LIKE '%42501%')
ORDER BY created_at DESC
LIMIT 20;

-- 5. ゲストトークンアクセスの統計情報
SELECT
    metadata->>'operationType' as operation_type,
    COUNT(*) as count,
    COUNT(CASE WHEN metadata->>'resultCount'::int > 0 THEN 1 END) as success_count,
    COUNT(CASE WHEN metadata->>'resultCount'::int = 0 THEN 1 END) as failure_count
FROM system_logs
WHERE
    level = 'debug'
    AND message LIKE '%Guest token%'
    AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY metadata->>'operationType';

-- 6. 招待トークンアクセスの統計情報
SELECT
    metadata->>'tag' as tag,
    COUNT(*) as count,
    COUNT(CASE WHEN metadata->>'canRegister' = 'true' THEN 1 END) as can_register_count,
    COUNT(CASE WHEN metadata->>'canRegister' = 'false' THEN 1 END) as cannot_register_count
FROM system_logs
WHERE
    level = 'debug'
    AND message LIKE '%Invite token%'
    AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY metadata->>'tag';
