-- settlements feature is retired. Remove the report snapshot table, RPCs, and log category.

DROP FUNCTION IF EXISTS public.generate_settlement_report(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_settlement_report_details(
  uuid,
  uuid[],
  timestamp with time zone,
  timestamp with time zone,
  integer,
  integer
);

DROP TABLE IF EXISTS public.settlements CASCADE;

UPDATE public.system_logs
   SET log_category = 'system'
 WHERE log_category = 'settlement';

ALTER TYPE public.log_category_enum RENAME TO log_category_enum_old;

CREATE TYPE public.log_category_enum AS ENUM (
  'authentication',
  'authorization',
  'event_management',
  'attendance',
  'payment',
  'stripe_webhook',
  'stripe_connect',
  'email',
  'export',
  'security',
  'system'
);

ALTER TABLE public.system_logs
  ALTER COLUMN log_category TYPE public.log_category_enum
  USING log_category::text::public.log_category_enum;

DROP TYPE public.log_category_enum_old;

COMMENT ON TYPE public.log_category_enum IS 'ログカテゴリ（アプリケーションドメイン別）';
