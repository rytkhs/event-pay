-- payments のステータス遷移ルールを DB に一本化する
-- - 従来のトリガーは status_rank() の大小比較しか行わず、TS の canPromoteStatus() が持つ
--   canceled / refunded の特例を欠いていた。結果として DB は paid -> canceled や
--   canceled -> refunded など 6 通りの不正遷移を通しており、最終防衛線として機能していなかった
-- - 遷移表を can_promote_payment_status() に切り出し、トリガーはそれに委譲する。
--   TS 側 core/utils/payments/status-rank.ts は本関数のミラーとし、
--   tests/db/payments/status-transition-parity.db.test.ts でドリフトを検知する
-- - 「rank 降格の防止」から「遷移表の強制」へ役割が変わるため、
--   トリガーと関数と例外メッセージを改名する。トリガー名の trg_ 前置は
--   BEFORE UPDATE トリガーの発火順（trigger_update_payment_version より先）を保つため維持する
-- - 内部 RPC バイパスは現金の集金取り消し（received/waived -> pending）専用に絞る。
--   従来は全チェックを無効化していた

GRANT CREATE ON SCHEMA public TO app_definer;

-- 決済ステータスの遷移可否。TS の canPromoteStatus() と同じ分岐順で判定する
CREATE OR REPLACE FUNCTION public.can_promote_payment_status(
  p_old public.payment_status_enum,
  p_new public.payment_status_enum
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
  SELECT CASE
    -- 同一ステータスへの遷移は許可（冪等性）
    WHEN p_old = p_new THEN true
    -- 基本的に降格は禁止
    WHEN public.status_rank(p_new) < public.status_rank(p_old) THEN false
    -- canceled は未集金系（pending/failed）からのみ遷移可能
    WHEN p_new = 'canceled' THEN p_old IN ('pending', 'failed')
    -- canceled からは他のステータスに遷移できない（終端状態）
    WHEN p_old = 'canceled' THEN false
    -- refunded は決済完了系（paid/received/waived）からのみ遷移可能
    WHEN p_new = 'refunded' THEN p_old IN ('paid', 'received', 'waived')
    ELSE true
  END;
$$;

ALTER FUNCTION public.can_promote_payment_status(
  public.payment_status_enum, public.payment_status_enum
) OWNER TO app_definer;

COMMENT ON FUNCTION public.can_promote_payment_status(
  public.payment_status_enum, public.payment_status_enum
) IS '決済ステータス遷移表の正本。TS の canPromoteStatus() はこの関数のミラー';

REVOKE ALL ON FUNCTION public.can_promote_payment_status(
  public.payment_status_enum, public.payment_status_enum
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_promote_payment_status(
  public.payment_status_enum, public.payment_status_enum
) TO anon;
GRANT EXECUTE ON FUNCTION public.can_promote_payment_status(
  public.payment_status_enum, public.payment_status_enum
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_promote_payment_status(
  public.payment_status_enum, public.payment_status_enum
) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_invalid_payment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- 内部RPC専用バイパス（難読化キー）: 現金の集金取り消しのみ通す
    IF current_setting('app.internal_rpc_bypass_c8f2a1b3', true) = 'true' THEN
      IF OLD.status IN ('received', 'waived') AND NEW.status = 'pending' THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Rejecting bypassed payment status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF NOT public.can_promote_payment_status(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Rejecting invalid payment status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.prevent_invalid_payment_status_transition() OWNER TO app_definer;

REVOKE ALL ON FUNCTION public.prevent_invalid_payment_status_transition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_invalid_payment_status_transition() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_invalid_payment_status_transition() TO service_role;

DROP TRIGGER IF EXISTS trg_prevent_payment_status_rollback ON public.payments;

CREATE OR REPLACE TRIGGER trg_prevent_invalid_payment_status_transition
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_invalid_payment_status_transition();

DROP FUNCTION IF EXISTS public.prevent_payment_status_rollback();

REVOKE CREATE ON SCHEMA public FROM app_definer;
