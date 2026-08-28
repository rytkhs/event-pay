-- payments.version を UPDATE のたびに必ず +1 する
-- - 従来は OLD.version = NEW.version のときだけ加算していたため、
--   version を明示指定した service_role の直接更新で楽観ロックを巻き戻せた
-- - rpc_update_payment_status_safe は WHERE version = p_expected_version で競合を検出し、
--   UPDATE 側でも version = version + 1 を指定しているため正規経路の結果は変わらない

GRANT CREATE ON SCHEMA public TO app_definer;

CREATE OR REPLACE FUNCTION public.update_payment_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  -- 呼び出し側の指定値に関わらず強制的に +1 する（巻き戻し禁止）
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_payment_version() OWNER TO app_definer;

COMMENT ON COLUMN public.payments.version IS 'Optimistic lock version. UPDATE ごとにトリガーが必ず +1 する（巻き戻し不可）';

REVOKE CREATE ON SCHEMA public FROM app_definer;
