-- Remove obsolete audit RPC functions
-- このマイグレーションでは、現在アプリケーションから参照されていない
-- 旧版の監査付き決済ステータス更新 RPC を削除します。
--
-- 関数一覧:
--   - update_payment_status_with_audit
--   - bulk_update_payment_status_with_audit
--
-- 依存関係:
--   現行ロジックは rpc_update_payment_status_safe / rpc_bulk_update_payment_status_safe
--   を使用しており、本マイグレーションによる影響はありません。

BEGIN;

-- 単体更新 RPC の削除
DROP FUNCTION IF EXISTS public.update_payment_status_with_audit(
  UUID,
  public.payment_status_enum,
  TIMESTAMPTZ,
  TEXT,
  UUID,
  TEXT
);

-- 一括更新 RPC の削除
DROP FUNCTION IF EXISTS public.bulk_update_payment_status_with_audit(
  UUID[],
  public.payment_status_enum,
  TEXT,
  UUID
);

COMMIT;
