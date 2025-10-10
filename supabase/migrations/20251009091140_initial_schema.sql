


-- ============================================================================
-- Migration: initial_schema
-- Description: みんなの集金 - 初期スキーマ定義
-- ============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- ============================================================================
-- SECTION 1: Schema & Extensions
-- ============================================================================

COMMENT ON SCHEMA "public" IS 'アプリケーション公開スキーマ';

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- ============================================================================
-- SECTION 2: Security Roles & Permissions
-- ============================================================================

-- Security hardening: app_definer role and schema access control
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_definer') THEN
        CREATE ROLE app_definer NOLOGIN;
    END IF;
END
$$;

GRANT app_definer TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO app_definer;
GRANT USAGE ON SCHEMA extensions TO app_definer;

-- Enable RLS bypass for app_definer (NOLOGIN definer-only role)
ALTER ROLE app_definer WITH BYPASSRLS;

-- ============================================================================
-- SECTION 3: Custom Types (ENUMs)
-- ============================================================================

CREATE TYPE "public"."actor_type_enum" AS ENUM (
    'user',
    'guest',
    'system',
    'webhook',
    'service_role',
    'anonymous'
);


ALTER TYPE "public"."actor_type_enum" OWNER TO "postgres";


COMMENT ON TYPE "public"."actor_type_enum" IS 'アクター種別（操作実行者の分類）';


CREATE TYPE "public"."attendance_status_enum" AS ENUM (
    'attending',
    'not_attending',
    'maybe'
);


ALTER TYPE "public"."attendance_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."log_category_enum" AS ENUM (
    'authentication',
    'authorization',
    'event_management',
    'attendance',
    'payment',
    'settlement',
    'stripe_webhook',
    'stripe_connect',
    'email',
    'export',
    'security',
    'system'
);


ALTER TYPE "public"."log_category_enum" OWNER TO "postgres";


COMMENT ON TYPE "public"."log_category_enum" IS 'ログカテゴリ（アプリケーションドメイン別）';


CREATE TYPE "public"."log_level_enum" AS ENUM (
    'debug',
    'info',
    'warn',
    'error',
    'critical'
);


ALTER TYPE "public"."log_level_enum" OWNER TO "postgres";


COMMENT ON TYPE "public"."log_level_enum" IS 'ログレベル（RFC 5424準拠）';


CREATE TYPE "public"."log_outcome_enum" AS ENUM (
    'success',
    'failure',
    'unknown'
);


ALTER TYPE "public"."log_outcome_enum" OWNER TO "postgres";


COMMENT ON TYPE "public"."log_outcome_enum" IS '処理結果（OpenTelemetry準拠）';


CREATE TYPE "public"."payment_method_enum" AS ENUM (
    'stripe',
    'cash'
);


ALTER TYPE "public"."payment_method_enum" OWNER TO "postgres";


CREATE TYPE "public"."payment_status_enum" AS ENUM (
    'pending',
    'paid',
    'failed',
    'received',
    'refunded',
    'waived',
    'canceled'
);


ALTER TYPE "public"."payment_status_enum" OWNER TO "postgres";


COMMENT ON TYPE "public"."payment_status_enum" IS '決済状況: pending, paid, failed, received, refunded, waived, canceled';


CREATE TYPE "public"."stripe_account_status_enum" AS ENUM (
    'unverified',
    'onboarding',
    'verified',
    'restricted'
);


ALTER TYPE "public"."stripe_account_status_enum" OWNER TO "postgres";

-- ============================================================================
-- SECTION 4: Functions (Business Logic)
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."admin_add_attendance_with_capacity_check"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_bypass_capacity" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_attendance_id UUID;
  v_capacity INTEGER;
  v_current_count INTEGER;
  v_event_creator_id UUID;
  v_current_user_id UUID;
BEGIN
  -- 入力パラメータの検証
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event ID cannot be null';
  END IF;

  IF p_nickname IS NULL OR LENGTH(TRIM(p_nickname)) = 0 THEN
    RAISE EXCEPTION 'Nickname cannot be null or empty';
  END IF;

  IF p_email IS NULL OR LENGTH(TRIM(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email cannot be null or empty';
  END IF;

  IF p_guest_token IS NULL OR LENGTH(TRIM(p_guest_token)) = 0 THEN
    RAISE EXCEPTION 'Guest token cannot be null or empty';
  END IF;

  -- 現在のユーザーIDを取得
  BEGIN
    v_current_user_id := NULL;
    v_current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_current_user_id := NULL;
  END;
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated' USING ERRCODE = '42501';
  END IF;

  -- イベント情報を排他ロック付きで取得（レースコンディション対策）
  SELECT capacity, created_by INTO v_capacity, v_event_creator_id
  FROM public.events
  WHERE id = p_event_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;

  -- 主催者権限チェック
  IF v_event_creator_id != v_current_user_id THEN
    RAISE EXCEPTION 'Only event creator can add participants' USING ERRCODE = '42501';
  END IF;

  -- ゲストトークンの重複チェック
  IF EXISTS(SELECT 1 FROM public.attendances WHERE guest_token = p_guest_token) THEN
    RAISE EXCEPTION 'Guest token already exists: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  -- 定員チェック（attending追加時のみ、バイパスフラグがfalseの場合）
  IF p_status = 'attending' AND v_capacity IS NOT NULL AND NOT p_bypass_capacity THEN
    -- 排他ロック取得済みのため、安全に参加者数をカウント
    SELECT COUNT(*) INTO v_current_count
    FROM public.attendances
    WHERE event_id = p_event_id AND status = 'attending';

    -- 定員超過チェック
    IF v_current_count >= v_capacity THEN
      RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_count
        USING ERRCODE = 'P0001',
              DETAIL = format('Current: %s, Capacity: %s, Bypass: %s', v_current_count, v_capacity, p_bypass_capacity),
              HINT = 'Set bypass_capacity=true to override capacity limit';
    END IF;
  END IF;

  -- 参加記録を挿入
  BEGIN
    INSERT INTO public.attendances (event_id, nickname, email, status, guest_token)
    VALUES (p_event_id, p_nickname, p_email, p_status, p_guest_token)
    RETURNING id INTO v_attendance_id;

    -- 挿入が成功したかを確認
    IF v_attendance_id IS NULL THEN
      RAISE EXCEPTION 'Failed to insert attendance record';
    END IF;

  EXCEPTION
    WHEN unique_violation THEN
      -- UNIQUE制約違反の適切な処理
      DECLARE
        v_constraint_name TEXT;
      BEGIN
        -- 違反した制約名を取得
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

        -- 制約別のエラーメッセージ
        IF v_constraint_name = 'attendances_guest_token_key' OR SQLERRM LIKE '%guest_token%' THEN
          RAISE EXCEPTION 'Guest token already exists (concurrent request detected): %', LEFT(p_guest_token, 8) || '...'
            USING ERRCODE = '23505',
                  DETAIL = 'This may indicate a race condition or duplicate request';
        ELSE
          RAISE EXCEPTION 'Unique constraint violation: %', SQLERRM
            USING ERRCODE = '23505';
        END IF;
      END;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to insert attendance: %', SQLERRM;
  END;

  RETURN v_attendance_id;
END;
$$;


ALTER FUNCTION "public"."admin_add_attendance_with_capacity_check"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_bypass_capacity" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_add_attendance_with_capacity_check"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_bypass_capacity" boolean) IS '主催者用参加者追加（排他ロック・定員チェック・レースコンディション対策）';


CREATE OR REPLACE FUNCTION "public"."calc_refund_dispute_summary"("p_event_id" "uuid") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_total_refunded_amount INTEGER := 0;
    v_refunded_count INTEGER := 0;
    v_total_app_fee_refunded INTEGER := 0;
    v_total_disputed_amount INTEGER := 0;
    v_dispute_count INTEGER := 0;
    v_result JSON;
BEGIN
    -- Refund totals
    SELECT
        COALESCE(SUM(p.refunded_amount), 0)::INT,
        COUNT(*)::INT,
        COALESCE(SUM(p.application_fee_refunded_amount), 0)::INT
    INTO
        v_total_refunded_amount,
        v_refunded_count,
        v_total_app_fee_refunded
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.refunded_amount > 0;

    -- Dispute totals: include all except 'won'
    SELECT
        COALESCE(SUM(d.amount), 0)::INT,
        COUNT(*)::INT
    INTO
        v_total_disputed_amount,
        v_dispute_count
    FROM public.payment_disputes d
    JOIN public.payments p ON p.id = d.payment_id
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND d.status NOT IN ('won', 'warning_closed');

    v_result := json_build_object(
        'totalRefundedAmount', v_total_refunded_amount,
        'refundedCount', v_refunded_count,
        'totalApplicationFeeRefunded', v_total_app_fee_refunded,
        'totalDisputedAmount', v_total_disputed_amount,
        'disputeCount', v_dispute_count
    );

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."calc_refund_dispute_summary"("p_event_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calc_refund_dispute_summary"("p_event_id" "uuid") IS '返金・Dispute集計（won以外を控除対象）';


CREATE OR REPLACE FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_total_fee INTEGER;
BEGIN
    SELECT COALESCE(SUM(p.application_fee_amount), 0)::INT
    INTO   v_total_fee
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status IN ('paid', 'refunded');

    RETURN v_total_fee;
END;
$$;


ALTER FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") IS 'アプリケーション手数料の合計（部分返金含む）';


CREATE OR REPLACE FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric DEFAULT NULL::numeric, "p_fixed_fee" integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_rate   NUMERIC := COALESCE(p_base_rate,  (SELECT stripe_base_rate  FROM public.fee_config LIMIT 1), 0.036);
    v_fixed  INTEGER := COALESCE(p_fixed_fee,  (SELECT stripe_fixed_fee FROM public.fee_config LIMIT 1), 0);
    v_total_fee INTEGER;
BEGIN
    SELECT COALESCE(SUM(
      COALESCE(p.stripe_balance_transaction_fee, ROUND(p.amount * v_rate + v_fixed))
    ), 0)::INT
      INTO v_total_fee
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status IN ('paid', 'refunded'); -- 修正: 一貫性のためrefundedも含める

    RETURN v_total_fee;
END;
$$;


ALTER FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) IS 'Stripe手数料合計（balance_transaction優先、フォールバック計算あり）';


CREATE OR REPLACE FUNCTION "public"."can_access_attendance"("p_attendance_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  event_id_for_attendance UUID;
  guest_token_var TEXT;
BEGIN

  -- 参加レコードのイベントIDを取得
  SELECT a.event_id INTO event_id_for_attendance
  FROM attendances a
  WHERE a.id = p_attendance_id;

  -- イベントが見つからない場合は拒否
  IF event_id_for_attendance IS NULL THEN
    RETURN FALSE;
  END IF;

  -- イベントアクセス権限をチェック（主催者・招待・ゲスト）
  IF public.can_access_event(event_id_for_attendance) THEN
    RETURN TRUE;
  END IF;

  -- ゲストトークンでの自分の参加情報アクセス（追加チェック）
  BEGIN
    guest_token_var := public.get_guest_token();
    IF guest_token_var IS NOT NULL AND EXISTS (
      SELECT 1 FROM attendances
      WHERE id = p_attendance_id
      AND attendances.guest_token = guest_token_var
    ) THEN
      RETURN TRUE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- エラーは無視して続行
  END;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."can_access_attendance"("p_attendance_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_access_attendance"("p_attendance_id" "uuid") IS '参加者アクセス権限チェック（イベント権限 or ゲストトークン）';


CREATE OR REPLACE FUNCTION "public"."can_access_event"("p_event_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  current_user_id UUID;
  guest_token_var TEXT;
BEGIN
  BEGIN
    current_user_id := NULL;
    current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    current_user_id := NULL;
  END;

  BEGIN
    guest_token_var := public.get_guest_token();
  EXCEPTION WHEN OTHERS THEN
    guest_token_var := NULL;
  END;

  IF current_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM events
      WHERE id = p_event_id
        AND created_by = current_user_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF guest_token_var IS NOT NULL AND guest_token_var != '' THEN
    IF EXISTS (
      SELECT 1 FROM attendances
      WHERE event_id = p_event_id
        AND attendances.guest_token = guest_token_var
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."can_access_event"("p_event_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_access_event"("p_event_id" "uuid") IS 'イベントアクセス権限（主催者・ゲストトークンのみ）';


CREATE OR REPLACE FUNCTION "public"."can_manage_invite_links"("p_event_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  current_user_id UUID;
BEGIN
  BEGIN
    current_user_id := NULL;
    current_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    current_user_id := NULL;
  END;

  -- 認証済みユーザーの主催者権限のみ
  IF current_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM events
    WHERE id = p_event_id
    AND created_by = current_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."can_manage_invite_links"("p_event_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_manage_invite_links"("p_event_id" "uuid") IS '招待リンク管理権限（主催者のみ）';


CREATE OR REPLACE FUNCTION "public"."check_attendance_capacity_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  event_capacity INTEGER;
  current_attending_count INTEGER;
BEGIN
    -- 【レースコンディション対策強化】参加状況チェック
    IF NEW.status = 'attending' THEN
        -- 【重要】イベント情報を排他ロック付きで取得（レースコンディション対策）
        SELECT capacity INTO event_capacity
        FROM public.events
        WHERE id = NEW.event_id FOR UPDATE;

        IF event_capacity IS NOT NULL THEN
            -- 【重要】イベントが既にロックされているため、安全に参加者数をカウント
            -- この時点で同一イベントへの他の参加登録はブロックされる
            SELECT COUNT(*) INTO current_attending_count
            FROM public.attendances
            WHERE event_id = NEW.event_id AND status = 'attending';

            -- 定員超過チェック
            IF current_attending_count >= event_capacity THEN
                RAISE EXCEPTION 'このイベントは定員（%名）に達しています', event_capacity
                  USING ERRCODE = 'P0001',
                        DETAIL = format('Current attendees: %s, Capacity: %s', current_attending_count, event_capacity),
                        HINT = 'Race condition prevented by exclusive lock in trigger';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_attendance_capacity_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") RETURNS TABLE("report_id" "uuid", "already_exists" boolean, "returned_event_id" "uuid", "event_title" character varying, "event_date" timestamp with time zone, "created_by" "uuid", "stripe_account_id" character varying, "transfer_group" "text", "total_stripe_sales" integer, "total_stripe_fee" integer, "total_application_fee" integer, "net_payout_amount" integer, "payment_count" integer, "refunded_count" integer, "total_refunded_amount" integer, "dispute_count" integer, "total_disputed_amount" integer, "report_generated_at" timestamp with time zone, "report_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
    v_payout_id UUID;
    v_event_data RECORD;
    v_stripe_sales INTEGER;
    v_stripe_fee INTEGER;
    v_application_fee INTEGER;
    v_total_refunded_amount INTEGER := 0;
    v_total_app_fee_refunded INTEGER := 0;
    v_net_application_fee INTEGER;
    v_net_amount INTEGER;
    v_payment_count INTEGER;
    v_refunded_count INTEGER := 0;
    v_dispute_count INTEGER := 0;
    v_total_disputed_amount INTEGER := 0;
    v_transfer_group TEXT;
    v_refund_data JSON;
    v_was_update BOOLEAN := FALSE;
    v_generated_at TIMESTAMPTZ;
    v_updated_at TIMESTAMPTZ;
BEGIN
    -- Validation
    IF (current_setting('request.jwt.claims', true) IS NULL) THEN
        RAISE EXCEPTION 'missing jwt claims';
    END IF;
    IF ((current_setting('request.jwt.claims', true)::json->>'sub')::uuid IS DISTINCT FROM input_created_by) THEN
        RAISE EXCEPTION 'Unauthorized: caller does not match created_by';
    END IF;
    IF input_event_id IS NULL OR input_created_by IS NULL THEN
        RAISE EXCEPTION 'event_id and created_by are required';
    END IF;

    -- Event & Connect account validation
    SELECT e.id,
           e.title,
           e.date,
           e.created_by,
           sca.stripe_account_id
      INTO v_event_data
      FROM public.events e
      JOIN public.stripe_connect_accounts sca ON sca.user_id = e.created_by
     WHERE e.id = input_event_id
       AND e.created_by = input_created_by
       AND sca.payouts_enabled = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found or organizer not authorized, or Stripe Connect account not ready';
    END IF;

    -- Correlation key for Transfers
    v_transfer_group := 'event_' || input_event_id::text || '_payout';

    -- Aggregate sales: include both paid & refunded Stripe payments
    SELECT COALESCE(SUM(p.amount), 0)::INT,
           COUNT(*)::INT
      INTO v_stripe_sales,
           v_payment_count
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = input_event_id
       AND p.method = 'stripe'
       AND p.status IN ('paid', 'refunded');

    -- Stripe platform fee (platform cost – not used in net calc)
    v_stripe_fee := public.calc_total_stripe_fee(input_event_id);

    -- Application fee (gross)
    v_application_fee := public.calc_total_application_fee(input_event_id);

    -- Refund summary JSON
    v_refund_data := public.calc_refund_dispute_summary(input_event_id);
    IF v_refund_data IS NOT NULL THEN
        v_total_refunded_amount  := COALESCE((v_refund_data ->> 'totalRefundedAmount')::INT, 0);
        v_total_app_fee_refunded := COALESCE((v_refund_data ->> 'totalApplicationFeeRefunded')::INT, 0);
        v_refunded_count         := COALESCE((v_refund_data ->> 'refundedCount')::INT, 0);
        v_dispute_count          := COALESCE((v_refund_data ->> 'disputeCount')::INT, 0);
        v_total_disputed_amount  := COALESCE((v_refund_data ->> 'totalDisputedAmount')::INT, 0);
    END IF;

    -- Net application fee (cannot be negative)
    v_net_application_fee := GREATEST(v_application_fee - v_total_app_fee_refunded, 0);

    -- Net payout amount (Stripe fee is platform-borne)
    v_net_amount := (v_stripe_sales - v_total_refunded_amount) - v_net_application_fee;

    -- Try to update existing active settlement record first
    UPDATE public.settlements SET
        total_stripe_sales = v_stripe_sales,
        total_stripe_fee = v_stripe_fee,
        platform_fee = v_net_application_fee,
        net_payout_amount = v_net_amount,
        updated_at = now()
    WHERE event_id = input_event_id
    RETURNING id, generated_at, updated_at
    INTO v_payout_id, v_generated_at, v_updated_at;

    -- Check if we updated an existing record
    IF FOUND THEN
        v_was_update := TRUE;
    ELSE
        -- Insert new settlement record if no active record exists
        INSERT INTO public.settlements (
            event_id,
            user_id,
            total_stripe_sales,
            total_stripe_fee,
            platform_fee,
            net_payout_amount,
            stripe_account_id,
            transfer_group,
            -- settlement_mode は削除済み
            -- status は削除済み
            generated_at
        ) VALUES (
            input_event_id,
            input_created_by,
            v_stripe_sales,
            v_stripe_fee,
            v_net_application_fee,
            v_net_amount,
            v_event_data.stripe_account_id,
            v_transfer_group,
            -- 'destination_charge', 'completed' は削除済み
            now()
        )
        RETURNING id, generated_at, updated_at
        INTO v_payout_id, v_generated_at, v_updated_at;

        v_was_update := FALSE;
    END IF;

    -- Return enriched record
    report_id := v_payout_id;
    already_exists := v_was_update;
    returned_event_id := input_event_id;
    event_title := v_event_data.title;
    event_date := v_event_data.date;
    created_by := input_created_by;
    stripe_account_id := v_event_data.stripe_account_id;
    transfer_group := v_transfer_group;
    total_stripe_sales := v_stripe_sales;
    total_stripe_fee := v_stripe_fee;
    total_application_fee := v_net_application_fee;
    net_payout_amount := v_net_amount;
    payment_count := v_payment_count;
    refunded_count := v_refunded_count;
    total_refunded_amount := v_total_refunded_amount;
    dispute_count := v_dispute_count;
    total_disputed_amount := v_total_disputed_amount;
    -- settlement_mode は削除済み
    report_generated_at := v_generated_at;
    report_updated_at := v_updated_at;

    RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_event_creator_name"("p_creator_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
    -- SECURITY DEFINER required: users table has "own record only" RLS policy
    -- This function allows reading other users' names (public info for event display)
    RETURN (SELECT name FROM public.users WHERE id = p_creator_id);
END;
$$;


ALTER FUNCTION "public"."get_event_creator_name"("p_creator_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_event_creator_name"("p_creator_id" "uuid") IS 'イベント主催者名取得（SECURITY DEFINER: users RLS回避、公開情報として扱う）';


CREATE OR REPLACE FUNCTION "public"."get_guest_token"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  token TEXT;
BEGIN
  -- 1. JWTクレームから取得（推奨、将来実装）
  BEGIN
    SELECT (current_setting('request.jwt.claims', true)::json->>'guest_token') INTO token;
    IF token IS NOT NULL AND token != '' THEN
      RETURN token;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- 続行
  END;

  -- 2. カスタムヘッダーから取得（現在の実装）
  BEGIN
    SELECT current_setting('request.headers', true)::json->>'x-guest-token' INTO token;
    IF token IS NOT NULL AND token != '' THEN
      RETURN token;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- 続行
  END;

  -- すべて失敗した場合はNULLを返す
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_guest_token"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_guest_token"() IS 'ゲストトークンをJWTクレームまたはHTTPヘッダー（x-guest-token）から取得。本番環境ではヘッダー経由を使用。';


CREATE OR REPLACE FUNCTION "public"."get_min_payout_amount"() RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
    SELECT COALESCE((SELECT min_payout_amount FROM public.fee_config LIMIT 1), 100);
$$;


ALTER FUNCTION "public"."get_min_payout_amount"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_min_payout_amount"() IS '最小送金金額（円）を返すユーティリティ関数。fee_config に設定が無い場合はデフォルト 100 円。';


CREATE OR REPLACE FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_from_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("report_id" "uuid", "event_id" "uuid", "event_title" character varying, "event_date" timestamp with time zone, "stripe_account_id" character varying, "transfer_group" character varying, "generated_at" timestamp with time zone, "total_stripe_sales" integer, "total_stripe_fee" integer, "total_application_fee" integer, "net_payout_amount" integer, "payment_count" integer, "refunded_count" integer, "total_refunded_amount" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
    -- 呼び出し元ユーザーの検証（引数を信頼しない）
    IF (current_setting('request.jwt.claims', true) IS NULL) THEN
        RAISE EXCEPTION 'missing jwt claims';
    END IF;
    IF ((current_setting('request.jwt.claims', true)::json->>'sub')::uuid IS DISTINCT FROM input_created_by) THEN
        RAISE EXCEPTION 'Unauthorized: caller does not match created_by';
    END IF;

    RETURN QUERY
    SELECT
        p.id AS report_id,
        p.event_id,
        e.title AS event_title,
        e.date AS event_date,
        p.stripe_account_id,
        p.transfer_group,
        p.generated_at,

        p.total_stripe_sales,
        p.total_stripe_fee,
        p.platform_fee AS total_application_fee,
        p.net_payout_amount,

        -- 決済件数を動的に取得 (修正: IN ('paid', 'refunded') で一貫性確保)
        (
            SELECT COUNT(*)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.status IN ('paid', 'refunded')
        ) AS payment_count,

        -- 返金件数・金額を動的に取得
        (
            SELECT COUNT(*)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.refunded_amount > 0
        ) AS refunded_count,

        (
            SELECT COALESCE(SUM(pay.refunded_amount), 0)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.refunded_amount > 0
        ) AS total_refunded_amount

        -- settlement_mode と status は削除済み（Payout機能削除により不要）
    FROM public.settlements p
    JOIN public.events e ON p.event_id = e.id
    WHERE p.user_id = input_created_by
      AND (input_event_ids IS NULL OR p.event_id = ANY(input_event_ids))
      AND (p_from_date IS NULL OR p.generated_at >= p_from_date)
      AND (p_to_date IS NULL OR p.generated_at <= p_to_date)
    ORDER BY p.generated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) IS '一貫した決済ステータスフィルタリング（paid + refunded）を適用した清算レポート詳細。他の清算関数との一貫性を保つためpayment_count計算を修正。';


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  -- auth.usersからのメタデータを使用してpublic.usersにプロファイルを作成
  INSERT INTO public.users (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'ユーザー')
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'auth.usersテーブルに新しいユーザーが作成された際に、自動的にpublic.usersテーブルにプロファイルレコードを作成する関数';


CREATE OR REPLACE FUNCTION "public"."hash_guest_token"("token" "text") RETURNS character varying
    LANGUAGE "plpgsql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
    -- Use pgcrypto.digest(bytea, text) with convert_to to avoid implicit cast errors
    RETURN encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'::text), 'hex');
END;
$$;


ALTER FUNCTION "public"."hash_guest_token"("token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."hash_guest_token"("token" "text") IS 'ゲストトークンSHA-256ハッシュ（監査ログ用）';


CREATE OR REPLACE FUNCTION "public"."prevent_payment_status_rollback"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- 内部RPC専用バイパス（難読化キー）
    IF current_setting('app.internal_rpc_bypass_c8f2a1b3', true) = 'true' THEN
      RETURN NEW;
    END IF;

    -- 通常のステータス遷移チェック（降格禁止）
    IF public.status_rank(NEW.status) < public.status_rank(OLD.status) THEN
      RAISE EXCEPTION 'Rejecting status rollback: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_payment_status_rollback"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_attendance_with_payment"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_payment_method" "public"."payment_method_enum" DEFAULT NULL::"public"."payment_method_enum", "p_event_fee" integer DEFAULT 0) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
DECLARE
  v_attendance_id UUID;
BEGIN
  -- 入力パラメータの検証
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event ID cannot be null';
  END IF;

  IF p_nickname IS NULL OR LENGTH(TRIM(p_nickname)) = 0 THEN
    RAISE EXCEPTION 'Nickname cannot be null or empty';
  END IF;

  IF p_email IS NULL OR LENGTH(TRIM(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email cannot be null or empty';
  END IF;

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'Status cannot be null';
  END IF;

  -- ゲストトークンの検証
  IF p_guest_token IS NULL OR LENGTH(p_guest_token) != 36 THEN
    RAISE EXCEPTION 'Guest token must be exactly 36 characters long with gst_ prefix, got: %', COALESCE(LENGTH(p_guest_token), 0);
  END IF;

  -- ゲストトークンの形式を検証
  IF NOT (p_guest_token ~ '^gst_[a-zA-Z0-9_-]{32}$') THEN
    RAISE EXCEPTION 'Guest token must have format gst_[32 alphanumeric chars], got: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  -- 【レースコンディション対策強化】イベント存在確認と定員チェック（attending状態の場合のみ）
  IF p_status = 'attending' THEN
    DECLARE
      v_capacity INTEGER;
      v_current_attendees INTEGER;
    BEGIN
      -- 【重要】イベント情報を排他ロック付きで取得（レースコンディション対策）
      -- 存在確認と定員取得を一度に実行
      SELECT capacity INTO v_capacity
      FROM public.events
      WHERE id = p_event_id FOR UPDATE;

      -- イベントが存在しない場合、v_capacity は NULL になる
      IF v_capacity IS NULL AND NOT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id) THEN
        RAISE EXCEPTION 'Event with ID % does not exist', p_event_id;
      END IF;

      -- 定員が設定されている場合のみチェック
      IF v_capacity IS NOT NULL THEN
        -- 【重要】イベントが既にロックされているため、他のトランザクションは待機状態
        -- この時点で安全に参加者数をカウントできる
        SELECT COUNT(*) INTO v_current_attendees
        FROM public.attendances
        WHERE event_id = p_event_id AND status = 'attending';

        -- 定員超過チェック
        IF v_current_attendees >= v_capacity THEN
          RAISE EXCEPTION 'このイベントは定員（%名）に達しています', v_capacity
            USING ERRCODE = 'P0001',
                  DETAIL = format('Current attendees: %s, Capacity: %s', v_current_attendees, v_capacity),
                  HINT = 'Race condition prevented by exclusive lock';
        END IF;
      END IF;
    END;
  ELSE
    -- 参加ステータスが 'attending' 以外の場合、イベントの存在確認のみ実行
    IF NOT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id) THEN
      RAISE EXCEPTION 'Event with ID % does not exist', p_event_id;
    END IF;
  END IF;

  -- 負の金額の事前検証（セキュリティ強化）
  IF p_event_fee IS NOT NULL AND p_event_fee < 0 THEN
    RAISE EXCEPTION 'Event fee cannot be negative, got: %', p_event_fee;
  END IF;

  -- ゲストトークンの重複チェック
  IF EXISTS(SELECT 1 FROM public.attendances WHERE guest_token = p_guest_token) THEN
    RAISE EXCEPTION 'Guest token % already exists (duplicate request)', LEFT(p_guest_token, 8) || '...'
      USING ERRCODE = '23505',
            DETAIL = 'This guest token is already in use';
  END IF;

  -- 1. 参加記録を挿入
  BEGIN
    INSERT INTO public.attendances (event_id, nickname, email, status, guest_token)
    VALUES (p_event_id, p_nickname, p_email, p_status, p_guest_token)
    RETURNING id INTO v_attendance_id;

    -- 挿入が成功したかを確認
    IF v_attendance_id IS NULL THEN
      RAISE EXCEPTION 'Failed to insert attendance record';
    END IF;

  EXCEPTION
    WHEN unique_violation THEN
      -- UNIQUE制約違反の適切な処理
      DECLARE
        v_constraint_name TEXT;
      BEGIN
        -- 違反した制約名を取得
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

        -- 制約別のエラーメッセージ
        IF v_constraint_name = 'attendances_guest_token_key' OR SQLERRM LIKE '%guest_token%' THEN
          RAISE EXCEPTION 'Guest token already exists (concurrent request detected): %', LEFT(p_guest_token, 8) || '...'
            USING ERRCODE = '23505',
                  DETAIL = 'This may indicate a race condition or duplicate request';
        ELSE
          RAISE EXCEPTION 'Unique constraint violation: %', SQLERRM
            USING ERRCODE = '23505';
        END IF;
      END;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to insert attendance: %', SQLERRM;
  END;

  -- 2. 参加ステータスが'attending'で、イベントが有料の場合、paymentsテーブルに決済記録を挿入
  -- 注意: この時点では負の値チェックが完了しており、p_event_fee >= 0 が保証されている
  DECLARE
    v_payment_id UUID;
  BEGIN
    IF p_status = 'attending' AND p_event_fee IS NOT NULL AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
      BEGIN
        INSERT INTO public.payments (attendance_id, amount, method, status)
        VALUES (v_attendance_id, p_event_fee, p_payment_method, 'pending')
        RETURNING id INTO v_payment_id;
      EXCEPTION
        WHEN OTHERS THEN
          -- 決済記録の挿入に失敗した場合、参加記録も削除してロールバック
          DELETE FROM public.attendances WHERE id = v_attendance_id;
          RAISE EXCEPTION 'Failed to insert payment record: %', SQLERRM;
      END;
    END IF;

    -- 3. 監査ログ記録
    INSERT INTO public.system_logs (
      log_category,
      action,
      message,
      actor_type,
      resource_type,
      resource_id,
      outcome,
      metadata
    )
    VALUES (
      'attendance',
      'attendance.register',
      'Attendance registered',
      (CASE WHEN p_guest_token IS NOT NULL THEN 'guest' ELSE 'system' END)::actor_type_enum,
      'attendance',
      v_attendance_id::text,
      'success',
      jsonb_build_object(
        'event_id', p_event_id,
        'status', p_status,
        'has_payment', (v_payment_id IS NOT NULL),
        'payment_method', p_payment_method,
        -- PII削減: emailはハッシュ化して保存
        'email_hash', encode(extensions.digest(convert_to(p_email, 'UTF8'), 'sha256'::text), 'hex')
      )
    );
  END;

  RETURN v_attendance_id;
END;
$_$;


ALTER FUNCTION "public"."register_attendance_with_payment"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) OWNER TO "app_definer";


COMMENT ON FUNCTION "public"."register_attendance_with_payment"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) IS '参加登録（決済レコード自動作成・監査ログ）';


CREATE OR REPLACE FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_update_item     jsonb;
  v_payment_id      uuid;
  v_expected_version integer;
  v_new_status      payment_status_enum;
  v_success_count   integer := 0;
  v_failure_count   integer := 0;
  v_failures        jsonb := '[]'::jsonb;
  v_result          json;
BEGIN
  -- 呼び出し元ユーザーの検証（引数p_user_idと照合）
  IF (current_setting('request.jwt.claims', true) IS NULL) THEN
    RAISE EXCEPTION 'missing jwt claims';
  END IF;
  IF ((current_setting('request.jwt.claims', true)::json->>'sub')::uuid IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match p_user_id' USING ERRCODE = 'P0001';
  END IF;
  -- 入力検証
  IF jsonb_array_length(p_payment_updates) > 50 THEN
    RAISE EXCEPTION 'Too many payments to update at once (max 50)'
      USING ERRCODE = 'P0004';
  END IF;

  -- 各決済を順次更新
  FOR v_update_item IN SELECT * FROM jsonb_array_elements(p_payment_updates)
  LOOP
    BEGIN
      v_payment_id := (v_update_item->>'payment_id')::uuid;
      v_expected_version := (v_update_item->>'expected_version')::integer;
      v_new_status := (v_update_item->>'new_status')::payment_status_enum;

      -- 個別の安全更新を実行
      PERFORM rpc_update_payment_status_safe(
        v_payment_id,
        v_new_status,
        v_expected_version,
        p_user_id,
        p_notes
      );

      v_success_count := v_success_count + 1;

    EXCEPTION
      WHEN OTHERS THEN
        v_failure_count := v_failure_count + 1;
        v_failures := v_failures || jsonb_build_object(
          'payment_id', v_payment_id,
          'error_code', SQLSTATE,
          'error_message', SQLERRM
        );
    END;
  END LOOP;

  -- 一括処理の監査ログ（新スキーマ対応）
  INSERT INTO public.system_logs (
    log_category,
    action,
    message,
    actor_type,
    user_id,
    resource_type,
    outcome,
    metadata
  )
  VALUES (
    'payment',
    'payment.bulk_status_update',
    format('Bulk payment status update completed: %s success, %s failures', v_success_count, v_failure_count),
    'user',
    p_user_id,
    'payment',
    CASE WHEN v_failure_count = 0 THEN 'success'::log_outcome_enum ELSE 'failure'::log_outcome_enum END,
    jsonb_build_object(
      'total_count', jsonb_array_length(p_payment_updates),
      'success_count', v_success_count,
      'failure_count', v_failure_count,
      'failures', v_failures,
      'notes', p_notes
    )
  );

  -- 結果返却
  v_result := jsonb_build_object(
    'success_count', v_success_count,
    'failure_count', v_failure_count,
    'failures', v_failures
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text") IS '決済ステータス一括更新（楽観ロック・詳細失敗報告）';


CREATE OR REPLACE FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_updated_rows     integer;
  v_payment_record   payments%ROWTYPE;
  v_attendance_record attendances%ROWTYPE;
  v_event_record     events%ROWTYPE;
  v_result           json;
BEGIN
  -- 呼び出し元ユーザーの検証（引数p_user_idと照合）
  IF (current_setting('request.jwt.claims', true) IS NULL) THEN
    RAISE EXCEPTION 'missing jwt claims';
  END IF;
  IF ((current_setting('request.jwt.claims', true)::json->>'sub')::uuid IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match p_user_id' USING ERRCODE = 'P0001';
  END IF;
  -- 個別にSELECTして各ROWTYPE変数へ格納（複数 INTO 禁止エラー回避）
  SELECT *
    INTO v_payment_record
    FROM payments
   WHERE id = p_payment_id
   FOR UPDATE;

  -- 決済レコードが存在しない場合は即座にエラー
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found: %', p_payment_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_attendance_record
    FROM attendances
   WHERE id = v_payment_record.attendance_id;

  -- 参加記録が存在しない場合（理論上起こらないが念のため）
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found: %', v_payment_record.attendance_id
      USING ERRCODE = 'P0005';
  END IF;

  SELECT *
    INTO v_event_record
    FROM events
   WHERE id = v_attendance_record.event_id;

  -- イベントが存在しない場合（参照整合性欠如）
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event record not found: %', v_attendance_record.event_id
      USING ERRCODE = 'P0006';
  END IF;

  -- 主催者権限チェック
  IF v_event_record.created_by != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: User % is not the event creator', p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 現金決済でない場合はエラー
  IF v_payment_record.method != 'cash' THEN
    RAISE EXCEPTION 'Only cash payments can be manually updated'
      USING ERRCODE = 'P0003';
  END IF;

  -- 2. 楽観的ロック付きステータス更新

  -- キャンセル操作の場合はセッション変数を設定してトリガーをスキップ
  IF p_new_status = 'pending' AND v_payment_record.status IN ('received', 'waived') THEN
    PERFORM set_config('app.internal_rpc_bypass_c8f2a1b3', 'true', true);
  END IF;

  UPDATE payments
  SET status = p_new_status,
      paid_at = CASE
        WHEN p_new_status = 'received' THEN now()
        WHEN p_new_status = 'waived' THEN paid_at  -- 免除時はpaid_atは変更しない
        WHEN p_new_status = 'pending' THEN NULL    -- 未決済時はpaid_atをクリア
        ELSE paid_at
      END,
      version = version + 1
  WHERE id = p_payment_id
    AND version = p_expected_version
    AND method = 'cash';

  -- セッション変数をクリア
  IF p_new_status = 'pending' THEN
    PERFORM set_config('app.internal_rpc_bypass_c8f2a1b3', 'false', true);
  END IF;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- バージョン競合検出
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Concurrent update detected for payment %', p_payment_id
      USING ERRCODE = '40001'; -- serialization_failure
  END IF;

  -- 3. 監査ログ記録（新スキーマ対応）
  INSERT INTO public.system_logs (
    log_category,
    action,
    message,
    actor_type,
    user_id,
    resource_type,
    resource_id,
    outcome,
    metadata
  )
  VALUES (
    'payment',
    'payment.status_update',
    format('Payment status updated from %s to %s', v_payment_record.status, p_new_status),
    'user',
    p_user_id,
    'payment',
    p_payment_id::text,
    'success',
    jsonb_build_object(
      'old_status', v_payment_record.status,
      'new_status', p_new_status,
      'expected_version', p_expected_version,
      'new_version', v_payment_record.version + 1,
      'notes', p_notes,
      'event_id', v_event_record.id,
      'attendance_id', v_attendance_record.id
    )
  );

  -- 4. 結果返却
  v_result := jsonb_build_object(
    'payment_id', p_payment_id,
    'status', p_new_status,
    'new_version', v_payment_record.version + 1,
    'updated_at', now()
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text") IS '決済ステータス更新（楽観ロック・監査ログ）';


CREATE OR REPLACE FUNCTION "public"."status_rank"("p" "public"."payment_status_enum") RETURNS integer
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$
  SELECT CASE p
    WHEN 'pending'   THEN 10
    WHEN 'failed'    THEN 15
    WHEN 'paid'      THEN 20
    WHEN 'received'  THEN 20
    WHEN 'waived'    THEN 25
    WHEN 'canceled'  THEN 35
    WHEN 'refunded'  THEN 40
    ELSE 0
  END;
$$;


ALTER FUNCTION "public"."status_rank"("p" "public"."payment_status_enum") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."status_rank"("p" "public"."payment_status_enum") IS '決済ステータス優先度（高いほど終端状態、降格防止用）';


CREATE OR REPLACE FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum" DEFAULT NULL::"public"."payment_method_enum", "p_event_fee" integer DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_event_id UUID;
  v_payment_id UUID;
  v_current_status public.attendance_status_enum;
  v_capacity INTEGER;
  v_current_attendees INTEGER;
  v_payment_status public.payment_status_enum;
  v_payment_method public.payment_method_enum;
  -- Guards (updated)
  v_canceled_at TIMESTAMPTZ;
  v_reg_deadline TIMESTAMPTZ;
  v_event_date TIMESTAMPTZ;
  v_guest_token TEXT;
BEGIN
  -- 参加記録の存在確認と現在のステータス取得
  SELECT event_id, status INTO v_event_id, v_current_status
  FROM public.attendances
  WHERE id = p_attendance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found';
  END IF;

  -- ゲスト本人確認（SECURITY DEFINERによりRLSがバイパスされるため明示チェック）
  v_guest_token := public.get_guest_token();
  IF v_guest_token IS NULL OR v_guest_token = '' THEN
    RAISE EXCEPTION 'Guest token is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.attendances a
    WHERE a.id = p_attendance_id AND a.guest_token = v_guest_token
  ) THEN
    RAISE EXCEPTION 'Unauthorized: guest does not own this attendance';
  END IF;

  -- イベント締切・開始・キャンセルチェック
  SELECT canceled_at, registration_deadline, date
    INTO v_canceled_at, v_reg_deadline, v_event_date
  FROM public.events
  WHERE id = v_event_id
  FOR SHARE;

  IF (v_canceled_at IS NOT NULL)
     OR (v_reg_deadline IS NOT NULL AND v_reg_deadline <= NOW())
     OR v_event_date <= NOW() THEN
    RAISE EXCEPTION 'Event is closed for modification';
  END IF;

  -- 定員チェック（attendingに変更する場合のみ）
  IF p_status = 'attending' AND v_current_status != 'attending' THEN
    SELECT capacity INTO v_capacity FROM public.events WHERE id = v_event_id FOR UPDATE;
    IF v_capacity IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_attendees
      FROM public.attendances
      WHERE event_id = v_event_id AND status = 'attending' AND id != p_attendance_id;

      IF v_current_attendees >= v_capacity THEN
        RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_attendees;
      END IF;
    END IF;
  END IF;

  -- 参加ステータスを更新
  UPDATE public.attendances
  SET status = p_status
  WHERE id = p_attendance_id;

  -- 決済レコードの処理
  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
    SELECT id, status INTO v_payment_id, v_payment_status
    FROM public.payments
    WHERE attendance_id = p_attendance_id
    ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      IF v_payment_status IN ('paid', 'received', 'waived') THEN
        -- 既に確定済みの有効な決済がある場合は再利用（何もしない）
        -- 不参加→再参加の場合でも、既存の決済を維持する
        NULL; -- 明示的に何もしないことを示す
      ELSIF v_payment_status = 'refunded' THEN
        -- 返金済み = 決済が無効化されているため、新規決済レコードが必要
        v_payment_id := NULL;
      ELSIF v_payment_status = 'canceled' THEN
        -- キャンセル済みレコードは新規レコードを再作成するため再利用しない
        v_payment_id := NULL;
      ELSIF v_payment_status NOT IN ('paid', 'received', 'waived', 'refunded', 'canceled') THEN
        -- pending, failed などの未確定状態は更新可能
        UPDATE public.payments
        SET method = p_payment_method,
            amount = p_event_fee,
            status = 'pending'
        WHERE id = v_payment_id;
      END IF;
    END IF;

    IF v_payment_id IS NULL THEN
      INSERT INTO public.payments (
        attendance_id,
        amount,
        method,
        status
      ) VALUES (
        p_attendance_id,
        p_event_fee,
        p_payment_method,
        'pending'
      );
    END IF;
  ELSIF p_status != 'attending' THEN
    SELECT id, status, method INTO v_payment_id, v_payment_status, v_payment_method
    FROM public.payments
    WHERE attendance_id = p_attendance_id
    ORDER BY paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_payment_status IN ('pending', 'failed') THEN
        UPDATE public.payments
        SET status = 'canceled',
            paid_at = NULL,
            updated_at = now()
        WHERE id = v_payment_id
          AND status IN ('pending', 'failed');

        -- 監査ログ記録（新スキーマ対応）
        INSERT INTO public.system_logs (
          log_category,
          action,
          message,
          actor_type,
          resource_type,
          resource_id,
          outcome,
          metadata
        )
        VALUES (
          'payment',
          'payment.canceled',
          'Payment canceled due to attendance status change',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'previous_status', v_payment_status,
            'new_status', 'canceled',
            'attendance_status', p_status
          )
        );
      ELSIF v_payment_status IN ('paid', 'received') THEN
        -- 監査ログ記録（新スキーマ対応）
        INSERT INTO public.system_logs (
          log_category,
          action,
          message,
          actor_type,
          resource_type,
          resource_id,
          outcome,
          metadata
        )
        VALUES (
          'payment',
          'payment.status_maintained',
          'Payment status maintained on attendance cancel (already paid)',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'payment_status', v_payment_status,
            'payment_method', v_payment_method,
            'attendance_status', p_status
          )
        );
      ELSIF v_payment_status = 'waived' THEN
        -- 監査ログ記録（新スキーマ対応）
        INSERT INTO public.system_logs (
          log_category,
          action,
          message,
          actor_type,
          resource_type,
          resource_id,
          outcome,
          metadata
        )
        VALUES (
          'payment',
          'payment.waived_kept',
          'Waived payment kept on attendance cancel',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'payment_status', v_payment_status,
            'attendance_status', p_status
          )
        );
      ELSIF v_payment_status = 'canceled' THEN
        -- 監査ログ記録（新スキーマ対応）
        INSERT INTO public.system_logs (
          log_category,
          action,
          message,
          actor_type,
          resource_type,
          resource_id,
          outcome,
          metadata
        )
        VALUES (
          'payment',
          'payment.canceled_duplicate',
          'Payment already canceled (duplicate cancel attempt)',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'payment_status', v_payment_status,
            'attendance_status', p_status
          )
        );
      ELSIF v_payment_status = 'refunded' THEN
        -- 監査ログ記録（新スキーマ対応）
        INSERT INTO public.system_logs (
          log_category,
          action,
          message,
          actor_type,
          resource_type,
          resource_id,
          outcome,
          metadata
        )
        VALUES (
          'payment',
          'payment.refund_maintained',
          'Refund status maintained on attendance cancel',
          'system',
          'payment',
          v_payment_id::text,
          'success',
          jsonb_build_object(
            'attendance_id', p_attendance_id,
            'payment_status', v_payment_status,
            'attendance_status', p_status
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;


ALTER FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) OWNER TO "app_definer";


COMMENT ON FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) IS 'ゲスト参加更新（決済処理・監査ログ）';


CREATE OR REPLACE FUNCTION "public"."update_payment_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- UPDATE 時に version を自動インクリメント（手動更新された場合のフォールバック）
  IF TG_OP = 'UPDATE' AND OLD.version = NEW.version THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_payment_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_revenue_summary"("p_event_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
    total_revenue INTEGER;
    stripe_revenue INTEGER;
    cash_revenue INTEGER;
    paid_count INTEGER;
    pending_count INTEGER;
    total_fees INTEGER;
    net_revenue INTEGER;
    result JSON;
BEGIN
    IF p_event_id IS NULL THEN
        RAISE EXCEPTION 'event_id cannot be null';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
        RAISE EXCEPTION 'Event not found: %', p_event_id;
    END IF;

    -- 売上集計（canceled と refunded を除外）
    -- 注意: 入金があれば attendance.status に関わらず売上として計上（会計原則）
    SELECT
        COALESCE(SUM(CASE WHEN p.status IN ('paid','received') THEN p.amount ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN p.method='stripe' AND p.status='paid' THEN p.amount ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN p.method='cash' AND p.status='received' THEN p.amount ELSE 0 END),0),
        COUNT(CASE WHEN p.status IN ('paid','received') THEN 1 END),
        -- 未収集計: pending と failed のみ（canceled と refunded を除外）
        COUNT(CASE WHEN p.status IN ('pending','failed') THEN 1 END)
      INTO total_revenue, stripe_revenue, cash_revenue, paid_count, pending_count
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id;

    -- Stripe 手数料を共通関数で取得
    total_fees := public.calc_total_stripe_fee(p_event_id);
    net_revenue := total_revenue - total_fees;

    result := json_build_object(
        'event_id', p_event_id,
        'total_revenue', total_revenue,
        'stripe_revenue', stripe_revenue,
        'cash_revenue', cash_revenue,
        'paid_count', paid_count,
        'pending_count', pending_count,
        'total_fees', total_fees,
        'net_revenue', net_revenue,
        'updated_at', now()
    );
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."update_revenue_summary"("p_event_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_revenue_summary"("p_event_id" "uuid") IS '売上サマリー（canceled/refunded除外、入金を売上計上）';


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

-- ============================================================================
-- SECTION 5: Tables
-- ============================================================================

SET default_tablespace = '';
SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."attendances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "nickname" character varying(50) NOT NULL,
    "email" character varying(255) NOT NULL,
    "status" "public"."attendance_status_enum" NOT NULL,
    "guest_token" character varying(36) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendances_email_check" CHECK ((("email")::"text" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::"text")),
    CONSTRAINT "attendances_nickname_check" CHECK (("length"(TRIM(BOTH FROM "nickname")) >= 1)),
    CONSTRAINT "attendances_guest_token_format_check" CHECK ((("guest_token")::"text" ~ '^gst_[A-Za-z0-9_-]{32}$'::"text"))
);


ALTER TABLE "public"."attendances" OWNER TO "postgres";


COMMENT ON TABLE "public"."attendances" IS 'イベントへの出欠情報';


COMMENT ON COLUMN "public"."attendances"."guest_token" IS 'ゲストアクセス用のトークン。gst_プレフィックス付き（Base64形式、合計36文字：gst_ + 32文字）';


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "date" timestamp with time zone NOT NULL,
    "location" character varying(500),
    "fee" integer DEFAULT 0 NOT NULL,
    "capacity" integer,
    "description" "text",
    "registration_deadline" timestamp with time zone NOT NULL,
    "payment_deadline" timestamp with time zone,
    "payment_methods" "public"."payment_method_enum"[] NOT NULL,
    "invite_token" character varying(255),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "allow_payment_after_deadline" boolean DEFAULT false NOT NULL,
    "grace_period_days" smallint DEFAULT 0 NOT NULL,
    "canceled_at" timestamp with time zone,
    "canceled_by" "uuid",
    CONSTRAINT "events_capacity_check" CHECK ((("capacity" IS NULL) OR ("capacity" > 0))),
    CONSTRAINT "events_date_after_creation" CHECK (("date" > "created_at")),
    CONSTRAINT "events_fee_check" CHECK ((("fee" = 0) OR (("fee" >= 100) AND ("fee" <= 1000000)))),
    CONSTRAINT "events_grace_period_days_check" CHECK ((("grace_period_days" >= 0) AND ("grace_period_days" <= 30))),
    CONSTRAINT "events_payment_deadline_after_registration" CHECK ((("payment_deadline" IS NULL) OR ("payment_deadline" >= "registration_deadline"))),
    CONSTRAINT "events_payment_deadline_required_if_stripe" CHECK (((NOT ('stripe'::"public"."payment_method_enum" = ANY ("payment_methods"))) OR ("payment_deadline" IS NOT NULL))),
    CONSTRAINT "events_payment_deadline_within_30d_after_date" CHECK ((("payment_deadline" IS NULL) OR ("payment_deadline" <= ("date" + '30 days'::interval)))),
    CONSTRAINT "events_payment_methods_check" CHECK (("array_length"("payment_methods", 1) > 0)),
    CONSTRAINT "events_registration_deadline_before_event" CHECK (("registration_deadline" <= "date"))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON TABLE "public"."events" IS 'イベント情報';


CREATE TABLE IF NOT EXISTS "public"."fee_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "stripe_base_rate" numeric(5,4) DEFAULT 0.0360 NOT NULL,
    "stripe_fixed_fee" integer DEFAULT 0 NOT NULL,
    "platform_fee_rate" numeric(5,4) DEFAULT 0 NOT NULL,
    "platform_fixed_fee" integer DEFAULT 0 NOT NULL,
    "min_platform_fee" integer DEFAULT 0 NOT NULL,
    "max_platform_fee" integer DEFAULT 0 NOT NULL,
    "min_payout_amount" integer DEFAULT 100 NOT NULL,
    "platform_tax_rate" numeric(5,2) DEFAULT 10.00 NOT NULL,
    "is_tax_included" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fee_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."fee_config" IS '手数料設定テーブル（シングルトン）';


COMMENT ON COLUMN "public"."fee_config"."stripe_base_rate" IS 'Stripe 決済手数料の割合 (0.036 = 3.6%)';


COMMENT ON COLUMN "public"."fee_config"."stripe_fixed_fee" IS 'Stripe 決済手数料の固定額 (円)';


COMMENT ON COLUMN "public"."fee_config"."min_payout_amount" IS '最小送金金額 (円)';


COMMENT ON COLUMN "public"."fee_config"."platform_tax_rate" IS 'Platform consumption tax rate (e.g., 10.00 for 10%)';


COMMENT ON COLUMN "public"."fee_config"."is_tax_included" IS 'Whether platform fees are calculated as tax-included (true=内税, false=外税)';


CREATE TABLE IF NOT EXISTS "public"."payment_disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid",
    "stripe_dispute_id" character varying(255) NOT NULL,
    "charge_id" character varying(255),
    "payment_intent_id" character varying(255),
    "amount" integer NOT NULL,
    "currency" character varying(10) DEFAULT 'jpy'::character varying NOT NULL,
    "reason" character varying(50),
    "status" character varying(50) NOT NULL,
    "evidence_due_by" timestamp with time zone,
    "stripe_account_id" character varying(255),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_disputes" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_disputes" IS 'Stripe Dispute records linked to payments for aggregation and audit.';


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attendance_id" "uuid" NOT NULL,
    "method" "public"."payment_method_enum" NOT NULL,
    "amount" integer NOT NULL,
    "status" "public"."payment_status_enum" DEFAULT 'pending'::"public"."payment_status_enum" NOT NULL,
    "stripe_payment_intent_id" character varying(255),
    "webhook_event_id" character varying(100),
    "webhook_processed_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "stripe_account_id" character varying(255),
    "application_fee_amount" integer DEFAULT 0 NOT NULL,
    "stripe_checkout_session_id" character varying(255),
    "transfer_group" character varying(255),
    "stripe_charge_id" character varying(255),
    "stripe_balance_transaction_id" character varying(255),
    "stripe_customer_id" character varying(255),
    "stripe_transfer_id" character varying(255),
    "refunded_amount" integer DEFAULT 0 NOT NULL,
    "destination_account_id" character varying(255),
    "application_fee_id" character varying(255),
    "application_fee_refund_id" character varying(255),
    "application_fee_refunded_amount" integer DEFAULT 0 NOT NULL,
    "application_fee_tax_rate" numeric(5,2) DEFAULT 0.00 NOT NULL,
    "application_fee_tax_amount" integer DEFAULT 0 NOT NULL,
    "application_fee_excl_tax" integer DEFAULT 0 NOT NULL,
    "tax_included" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_balance_transaction_fee" integer,
    "stripe_balance_transaction_net" integer,
    "stripe_fee_details" "jsonb",
    "version" integer DEFAULT 1 NOT NULL,
    "checkout_idempotency_key" "text",
    "checkout_key_revision" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "chk_payments_application_fee_amount_non_negative" CHECK (("application_fee_amount" >= 0)),
    CONSTRAINT "chk_payments_application_fee_refunded_amount_non_negative" CHECK (("application_fee_refunded_amount" >= 0)),
    CONSTRAINT "chk_payments_refunded_amount_non_negative" CHECK (("refunded_amount" >= 0)),
    CONSTRAINT "payments_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "payments_paid_at_when_paid" CHECK (((("status" = ANY (ARRAY['paid'::"public"."payment_status_enum", 'received'::"public"."payment_status_enum"])) AND ("paid_at" IS NOT NULL)) OR ("status" <> ALL (ARRAY['paid'::"public"."payment_status_enum", 'received'::"public"."payment_status_enum"])))),
    CONSTRAINT "payments_stripe_intent_required" CHECK (((("method" = 'stripe'::"public"."payment_method_enum") AND ("status" = 'pending'::"public"."payment_status_enum")) OR (("method" = 'stripe'::"public"."payment_method_enum") AND ("status" = 'canceled'::"public"."payment_status_enum")) OR (("method" = 'stripe'::"public"."payment_method_enum") AND ("status" <> ALL (ARRAY['pending'::"public"."payment_status_enum", 'canceled'::"public"."payment_status_enum"])) AND ("stripe_payment_intent_id" IS NOT NULL)) OR ("method" <> 'stripe'::"public"."payment_method_enum")))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."payments" IS '決済情報（Destination charges対応）';


COMMENT ON COLUMN "public"."payments"."application_fee_amount" IS 'プラットフォーム手数料（円）';


COMMENT ON COLUMN "public"."payments"."stripe_checkout_session_id" IS 'Stripe Checkout Session ID';


COMMENT ON COLUMN "public"."payments"."transfer_group" IS 'イベント単位の送金グループ識別子';


COMMENT ON COLUMN "public"."payments"."stripe_charge_id" IS 'Stripe Charge ID（確定時に保存）';


COMMENT ON COLUMN "public"."payments"."stripe_balance_transaction_id" IS 'Stripe Balance Transaction ID';


COMMENT ON COLUMN "public"."payments"."stripe_customer_id" IS 'Stripe Customer ID（将来の継続課金用）';


COMMENT ON COLUMN "public"."payments"."stripe_transfer_id" IS 'Stripe Transfer ID（自動Transfer相関用）';


COMMENT ON COLUMN "public"."payments"."refunded_amount" IS '返金累積額（円）';


COMMENT ON COLUMN "public"."payments"."destination_account_id" IS 'Stripe Connect宛先アカウントID';


COMMENT ON COLUMN "public"."payments"."application_fee_id" IS 'Stripe Application Fee ID';


COMMENT ON COLUMN "public"."payments"."application_fee_refund_id" IS 'Stripe Application Fee Refund ID';


COMMENT ON COLUMN "public"."payments"."application_fee_refunded_amount" IS 'プラットフォーム手数料返金額（円）';


COMMENT ON COLUMN "public"."payments"."application_fee_tax_rate" IS 'Tax rate applied to application fee (e.g., 10.00 for 10%)';


COMMENT ON COLUMN "public"."payments"."application_fee_tax_amount" IS 'Tax amount in yen (integer)';


COMMENT ON COLUMN "public"."payments"."application_fee_excl_tax" IS 'Application fee excluding tax in yen (integer)';


COMMENT ON COLUMN "public"."payments"."tax_included" IS 'Whether the application_fee_amount includes tax (true=tax included, false=tax excluded)';


COMMENT ON COLUMN "public"."payments"."version" IS 'Optimistic lock version to prevent concurrent updates';


COMMENT ON CONSTRAINT "payments_stripe_intent_required" ON "public"."payments" IS 'Ensures stripe_payment_intent_id is present for stripe payments except pending and canceled statuses. Canceled is a terminal state for unpaid transactions.';


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS '運営者情報（Supabase auth.usersと同期）';


CREATE OR REPLACE VIEW "public"."public_profiles" AS
 SELECT "id",
    "name",
    "created_at"
   FROM "public"."users";


ALTER VIEW "public"."public_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "total_stripe_sales" integer DEFAULT 0 NOT NULL,
    "total_stripe_fee" integer DEFAULT 0 NOT NULL,
    "platform_fee" integer DEFAULT 0 NOT NULL,
    "net_payout_amount" integer DEFAULT 0 NOT NULL,
    "webhook_event_id" character varying(100),
    "webhook_processed_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "notes" "text",
    "stripe_account_id" character varying(255) NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "transfer_group" character varying(255),
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_disputed_amount" integer DEFAULT 0 NOT NULL,
    "dispute_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "settlements_amounts_non_negative" CHECK ((("total_stripe_sales" >= 0) AND ("total_stripe_fee" >= 0) AND ("platform_fee" >= 0) AND ("net_payout_amount" >= 0))),
    CONSTRAINT "settlements_calculation_reasonable" CHECK ((("net_payout_amount" <= "total_stripe_sales") AND ("net_payout_amount" >= 0)))
);


ALTER TABLE "public"."settlements" OWNER TO "postgres";


COMMENT ON TABLE "public"."settlements" IS '運営者への売上清算履歴（レポート・スナップショット用途）';


COMMENT ON COLUMN "public"."settlements"."stripe_account_id" IS 'Stripe Connect Account ID';


COMMENT ON COLUMN "public"."settlements"."retry_count" IS '清算処理のリトライ回数';


COMMENT ON COLUMN "public"."settlements"."last_error" IS '最後に発生したエラーメッセージ';


COMMENT ON COLUMN "public"."settlements"."transfer_group" IS 'イベント単位の送金グループ識別子';


COMMENT ON COLUMN "public"."settlements"."generated_at" IS 'レポート生成日時';


CREATE TABLE IF NOT EXISTS "public"."stripe_connect_accounts" (
    "user_id" "uuid" NOT NULL,
    "stripe_account_id" character varying(255) NOT NULL,
    "status" "public"."stripe_account_status_enum" DEFAULT 'unverified'::"public"."stripe_account_status_enum" NOT NULL,
    "charges_enabled" boolean DEFAULT false NOT NULL,
    "payouts_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_connect_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_connect_accounts" IS 'Stripe Connectアカウント情報';


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "log_level" "public"."log_level_enum" DEFAULT 'info'::"public"."log_level_enum" NOT NULL,
    "log_category" "public"."log_category_enum" NOT NULL,
    "actor_type" "public"."actor_type_enum" DEFAULT 'system'::"public"."actor_type_enum" NOT NULL,
    "actor_identifier" "text",
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "message" "text" NOT NULL,
    "outcome" "public"."log_outcome_enum" DEFAULT 'success'::"public"."log_outcome_enum" NOT NULL,
    "request_id" "text",
    "session_id" "text",
    "stripe_request_id" "text",
    "stripe_event_id" "text",
    "idempotency_key" "text",
    "metadata" "jsonb",
    "tags" "text"[],
    "error_code" "text",
    "error_message" "text",
    "error_stack" "text",
    "dedupe_key" "text"
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_logs" IS 'アプリケーション監査ログテーブル（ECS、OpenTelemetry、OWASP準拠）

用途:
- 認証・認可イベントの記録
- CRUD操作の監査証跡
- 決済・清算処理の追跡
- セキュリティイベントの検出
- Stripe連携の障害調査

保存期間: 1年（パフォーマンス要件に応じて定期削除推奨）
アクセス制御: service_role のみ（RLS有効）';


COMMENT ON COLUMN "public"."system_logs"."id" IS '一意な識別子（自動採番）';


COMMENT ON COLUMN "public"."system_logs"."created_at" IS 'ログ記録日時（UTC）';


COMMENT ON COLUMN "public"."system_logs"."log_level" IS 'ログレベル（debug/info/warn/error/critical）';


COMMENT ON COLUMN "public"."system_logs"."log_category" IS 'ログカテゴリ（アプリケーションドメイン別）';


COMMENT ON COLUMN "public"."system_logs"."actor_type" IS '【Who】アクター種別（user/guest/system/webhook/service_role/anonymous）';


COMMENT ON COLUMN "public"."system_logs"."actor_identifier" IS '【Who】アクター識別子（user_id、guest_token、webhook名、IPアドレス等）';


COMMENT ON COLUMN "public"."system_logs"."user_id" IS '【Who】認証済みユーザーID（auth.users.id への外部キー）';


COMMENT ON COLUMN "public"."system_logs"."action" IS '【What】実行されたアクション（例: event.create, payment.update, user.login）';


COMMENT ON COLUMN "public"."system_logs"."resource_type" IS '【What】操作対象のリソース種別（例: event, payment, attendance）';


COMMENT ON COLUMN "public"."system_logs"."resource_id" IS '【What】操作対象のリソースID（UUID、Stripe ID等）';


COMMENT ON COLUMN "public"."system_logs"."ip_address" IS '【Where】クライアントIPアドレス（PII保護のためマスキング推奨）';


COMMENT ON COLUMN "public"."system_logs"."user_agent" IS '【Where】User-Agent文字列（ブラウザ・デバイス情報）';


COMMENT ON COLUMN "public"."system_logs"."message" IS '【Why】人間可読なログメッセージ';


COMMENT ON COLUMN "public"."system_logs"."outcome" IS '【How】処理結果（success/failure/unknown）';


COMMENT ON COLUMN "public"."system_logs"."request_id" IS 'リクエストID（分散トレーシング用）';


COMMENT ON COLUMN "public"."system_logs"."session_id" IS 'セッションID（ユーザーセッション追跡用）';


COMMENT ON COLUMN "public"."system_logs"."stripe_request_id" IS 'Stripe Request-Id（Stripe API障害調査用）';


COMMENT ON COLUMN "public"."system_logs"."stripe_event_id" IS 'Stripe Event ID（Webhook処理追跡用）';


COMMENT ON COLUMN "public"."system_logs"."idempotency_key" IS 'Stripe Idempotency-Key（冪等性保証用）';


COMMENT ON COLUMN "public"."system_logs"."metadata" IS '構造化された追加情報（JSONB形式、柔軟な拡張用）';


COMMENT ON COLUMN "public"."system_logs"."tags" IS 'フリータグ配列（検索・集計用）';


COMMENT ON COLUMN "public"."system_logs"."error_code" IS 'エラーコード（failure時のみ、アプリ定義）';


COMMENT ON COLUMN "public"."system_logs"."error_message" IS 'エラーメッセージ（failure時のみ）';


COMMENT ON COLUMN "public"."system_logs"."error_stack" IS 'スタックトレース（failure時のみ、開発環境推奨）';


COMMENT ON COLUMN "public"."system_logs"."dedupe_key" IS '重複防止キー（冪等性保証用）。同一キーのログは1度のみ記録される。
NULL値の場合は重複チェックなし。
形式例:
- Webhook: webhook:{stripe_event_id}
- Transaction: tx:{action}:{resource_id}:{timestamp_ms}
- Idempotent: idempotent:{idempotency_key}
- Custom: {log_category}:{unique_identifier}';


CREATE SEQUENCE IF NOT EXISTS "public"."system_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."system_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."system_logs_id_seq" OWNED BY "public"."system_logs"."id";

ALTER TABLE ONLY "public"."system_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."system_logs_id_seq"'::"regclass");

-- ============================================================================
-- SECTION 6: Primary Keys & Unique Constraints
-- ============================================================================

ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_guest_token_key" UNIQUE ("guest_token");


ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_invite_token_key" UNIQUE ("invite_token");


ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."fee_config"
    ADD CONSTRAINT "fee_config_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."payment_disputes"
    ADD CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."payment_disputes"
    ADD CONSTRAINT "payment_disputes_stripe_dispute_id_key" UNIQUE ("stripe_dispute_id");


ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");


ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_pkey" PRIMARY KEY ("user_id");


ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_stripe_account_id_key" UNIQUE ("stripe_account_id");


ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- ============================================================================
-- SECTION 7: Indexes (Performance Optimization)
-- ============================================================================

CREATE UNIQUE INDEX "attendances_event_email_unique" ON "public"."attendances" USING "btree" ("event_id", lower("email"));


CREATE INDEX "idx_attendances_event_id" ON "public"."attendances" USING "btree" ("event_id");




CREATE INDEX "idx_attendances_event_id_id" ON "public"."attendances" USING "btree" ("event_id", "id");






CREATE INDEX "idx_events_canceled_at" ON "public"."events" USING "btree" ("canceled_at");


CREATE INDEX "idx_events_created_by" ON "public"."events" USING "btree" ("created_by");


CREATE INDEX "idx_events_created_by_date" ON "public"."events" USING "btree" ("created_by", "date");


CREATE INDEX "idx_events_date" ON "public"."events" USING "btree" ("date");


CREATE INDEX "idx_events_deadlines" ON "public"."events" USING "btree" ("registration_deadline", "payment_deadline", "date") WHERE (("registration_deadline" IS NOT NULL) OR ("payment_deadline" IS NOT NULL));


CREATE INDEX "idx_events_invite_token" ON "public"."events" USING "btree" ("invite_token") WHERE ("invite_token" IS NOT NULL);


CREATE INDEX "idx_payment_disputes_charge_id" ON "public"."payment_disputes" USING "btree" ("charge_id");


CREATE INDEX "idx_payment_disputes_dispute_status" ON "public"."payment_disputes" USING "btree" ("status");


CREATE INDEX "idx_payment_disputes_payment_id" ON "public"."payment_disputes" USING "btree" ("payment_id");


CREATE INDEX "idx_payment_disputes_pi_id" ON "public"."payment_disputes" USING "btree" ("payment_intent_id");


CREATE INDEX "idx_payments_attendance_id" ON "public"."payments" USING "btree" ("attendance_id");


CREATE INDEX "idx_payments_balance_txn" ON "public"."payments" USING "btree" ("stripe_balance_transaction_id");


CREATE INDEX "idx_payments_balance_txn_fee" ON "public"."payments" USING "btree" ("stripe_balance_transaction_fee");


CREATE INDEX "idx_payments_balance_txn_net" ON "public"."payments" USING "btree" ("stripe_balance_transaction_net");


CREATE INDEX "idx_payments_checkout_idempotency_key" ON "public"."payments" USING "btree" ("checkout_idempotency_key") WHERE ("checkout_idempotency_key" IS NOT NULL);


CREATE INDEX "idx_payments_checkout_session" ON "public"."payments" USING "btree" ("stripe_checkout_session_id");


CREATE INDEX "idx_payments_customer_id" ON "public"."payments" USING "btree" ("stripe_customer_id");


CREATE INDEX "idx_payments_destination_account" ON "public"."payments" USING "btree" ("destination_account_id");


CREATE INDEX "idx_payments_id_version" ON "public"."payments" USING "btree" ("id", "version");


CREATE INDEX "idx_payments_method_status_paid" ON "public"."payments" USING "btree" ("method", "status") WHERE (("method" = 'stripe'::"public"."payment_method_enum") AND ("status" = 'paid'::"public"."payment_status_enum"));


CREATE INDEX "idx_payments_refunded_amount" ON "public"."payments" USING "btree" ("refunded_amount") WHERE ("refunded_amount" > 0);


CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");


CREATE INDEX "idx_payments_stripe_account_id" ON "public"."payments" USING "btree" ("stripe_account_id");


CREATE UNIQUE INDEX "idx_payments_stripe_charge_id" ON "public"."payments" USING "btree" ("stripe_charge_id") WHERE ("stripe_charge_id" IS NOT NULL);


CREATE INDEX "idx_payments_tax_included" ON "public"."payments" USING "btree" ("tax_included");


CREATE INDEX "idx_payments_tax_rate" ON "public"."payments" USING "btree" ("application_fee_tax_rate");


CREATE INDEX "idx_payments_transfer_group" ON "public"."payments" USING "btree" ("transfer_group");


CREATE INDEX "idx_payments_webhook_event" ON "public"."payments" USING "btree" ("webhook_event_id");


CREATE INDEX "idx_settlements_event_generated_at" ON "public"."settlements" USING "btree" ("event_id", "generated_at");


CREATE INDEX "idx_settlements_event_id" ON "public"."settlements" USING "btree" ("event_id");


CREATE INDEX "idx_settlements_generated_date_jst" ON "public"."settlements" USING "btree" (((("generated_at" AT TIME ZONE 'Asia/Tokyo'::"text"))::"date"));


CREATE INDEX "idx_settlements_stripe_account" ON "public"."settlements" USING "btree" ("stripe_account_id");


CREATE INDEX "idx_settlements_transfer_group" ON "public"."settlements" USING "btree" ("transfer_group");


CREATE INDEX "idx_settlements_user_id" ON "public"."settlements" USING "btree" ("user_id");


CREATE INDEX "idx_stripe_connect_accounts_status" ON "public"."stripe_connect_accounts" USING "btree" ("status");


CREATE INDEX "idx_stripe_connect_accounts_stripe_account_id" ON "public"."stripe_connect_accounts" USING "btree" ("stripe_account_id");


CREATE INDEX "idx_stripe_connect_accounts_user_id" ON "public"."stripe_connect_accounts" USING "btree" ("user_id");


CREATE INDEX "idx_system_logs_action" ON "public"."system_logs" USING "btree" ("action", "created_at" DESC);


CREATE INDEX "idx_system_logs_category" ON "public"."system_logs" USING "btree" ("log_category", "created_at" DESC);


CREATE INDEX "idx_system_logs_created_at" ON "public"."system_logs" USING "btree" ("created_at" DESC);


CREATE UNIQUE INDEX "idx_system_logs_dedupe_key" ON "public"."system_logs" USING "btree" ("dedupe_key") WHERE ("dedupe_key" IS NOT NULL);


CREATE INDEX "idx_system_logs_errors" ON "public"."system_logs" USING "btree" ("log_level", "created_at" DESC) WHERE ("log_level" = ANY (ARRAY['error'::"public"."log_level_enum", 'critical'::"public"."log_level_enum"]));


CREATE INDEX "idx_system_logs_level" ON "public"."system_logs" USING "btree" ("log_level", "created_at" DESC);


CREATE INDEX "idx_system_logs_metadata" ON "public"."system_logs" USING "gin" ("metadata");


CREATE INDEX "idx_system_logs_request_id" ON "public"."system_logs" USING "btree" ("request_id") WHERE ("request_id" IS NOT NULL);


CREATE INDEX "idx_system_logs_resource" ON "public"."system_logs" USING "btree" ("resource_type", "resource_id", "created_at" DESC) WHERE (("resource_type" IS NOT NULL) AND ("resource_id" IS NOT NULL));


CREATE INDEX "idx_system_logs_stripe_event" ON "public"."system_logs" USING "btree" ("stripe_event_id") WHERE ("stripe_event_id" IS NOT NULL);


CREATE INDEX "idx_system_logs_stripe_request" ON "public"."system_logs" USING "btree" ("stripe_request_id") WHERE ("stripe_request_id" IS NOT NULL);


CREATE INDEX "idx_system_logs_tags" ON "public"."system_logs" USING "gin" ("tags");


CREATE INDEX "idx_system_logs_user_id" ON "public"."system_logs" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);


CREATE UNIQUE INDEX "uniq_settlements_event_generated_date_jst" ON "public"."settlements" USING "btree" ("event_id", ((("generated_at" AT TIME ZONE 'Asia/Tokyo'::"text"))::"date"));


CREATE UNIQUE INDEX "unique_open_payment_per_attendance" ON "public"."payments" USING "btree" ("attendance_id") WHERE ("status" = 'pending'::"public"."payment_status_enum");

-- ============================================================================
-- SECTION 8: Triggers
-- ============================================================================

CREATE OR REPLACE TRIGGER "check_attendance_capacity_before_insert_or_update" BEFORE INSERT OR UPDATE ON "public"."attendances" FOR EACH ROW EXECUTE FUNCTION "public"."check_attendance_capacity_limit"();

CREATE OR REPLACE TRIGGER "trg_prevent_payment_status_rollback" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_payment_status_rollback"();

CREATE OR REPLACE TRIGGER "trigger_update_payment_version" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_payment_version"();

CREATE OR REPLACE TRIGGER "update_attendances_updated_at" BEFORE UPDATE ON "public"."attendances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_events_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_settlements_updated_at" BEFORE UPDATE ON "public"."settlements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_stripe_connect_accounts_updated_at" BEFORE UPDATE ON "public"."stripe_connect_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- ============================================================================
-- SECTION 9: Foreign Keys
-- ============================================================================

ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_canceled_by_fkey" FOREIGN KEY ("canceled_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."payment_disputes"
    ADD CONSTRAINT "payment_disputes_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- ============================================================================
-- SECTION 10.A: Security defaults & definer grants
-- ============================================================================

-- Grant minimal table access to app_definer role (SECURITY DEFINER functions only)
-- app_definer has BYPASSRLS + NOLOGIN, these grants enable function execution without exposing direct user access
-- Minimized: only SELECT + limited write operations needed by SECURITY DEFINER functions
-- NOTE: UPDATE privilege is needed for FOR UPDATE locks in SECURITY DEFINER functions
GRANT SELECT, UPDATE ON TABLE public.events TO app_definer;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendances TO app_definer;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payments TO app_definer;
GRANT SELECT, INSERT, UPDATE ON TABLE public.settlements TO app_definer;
GRANT SELECT, INSERT ON TABLE public.users TO app_definer;
GRANT SELECT ON TABLE public.public_profiles TO app_definer;
GRANT SELECT ON TABLE public.fee_config TO app_definer;
GRANT SELECT ON TABLE public.stripe_connect_accounts TO app_definer;
GRANT SELECT ON TABLE public.payment_disputes TO app_definer;
GRANT INSERT ON TABLE public.system_logs TO app_definer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_definer;


-- Security: Revoke default function execute, add public-safe RPCs
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE app_definer IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres   IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_guest_token() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_event(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_public_get_event(p_invite_token text)
RETURNS TABLE (
    id uuid,
    title character varying(255),
    date timestamptz,
    location character varying(500),
    description text,
    fee integer,
    capacity integer,
    payment_methods public.payment_method_enum[],
    registration_deadline timestamptz,
    payment_deadline timestamptz,
    invite_token character varying(255),
    canceled_at timestamptz,
    attendances_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.title,
        e.date,
        e.location,
        e.description,
        e.fee,
        e.capacity,
        e.payment_methods,
        e.registration_deadline,
        e.payment_deadline,
        e.invite_token,
        e.canceled_at,
        (
          SELECT COUNT(*)::int
          FROM public.attendances a
          WHERE a.event_id = e.id AND a.status = 'attending'
        ) AS attendances_count
    FROM public.events e
    WHERE e.invite_token = p_invite_token
      AND e.canceled_at IS NULL
      AND e.date > NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_public_attending_count(p_event_id uuid, p_invite_token text)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.events
      WHERE id = p_event_id
        AND invite_token = p_invite_token
        AND canceled_at IS NULL
        AND date > NOW()
    ) THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    SELECT COUNT(*)::int INTO v_count
    FROM public.attendances a
    WHERE a.event_id = p_event_id
      AND a.status = 'attending';

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_guest_get_attendance()
RETURNS TABLE (
    attendance_id uuid,
    nickname character varying(50),
    email character varying(255),
    status public.attendance_status_enum,
    guest_token character varying(36),
    event_id uuid,
    event_title character varying(255),
    event_date timestamptz,
    event_fee integer,
    created_by uuid,
    registration_deadline timestamptz,
    payment_deadline timestamptz,
    canceled_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.nickname,
        a.email,
        a.status,
        a.guest_token,
        e.id,
        e.title,
        e.date,
        e.fee,
        e.created_by,
        e.registration_deadline,
        e.payment_deadline,
        e.canceled_at
    FROM public.attendances a
    JOIN public.events e ON e.id = a.event_id
    WHERE a.guest_token = public.get_guest_token()
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_public_check_duplicate_email(p_event_id uuid, p_email text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_exists boolean := false;
BEGIN
    IF NOT public.can_access_event(p_event_id) THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.attendances a
        WHERE a.event_id = p_event_id
          AND lower(a.email) = lower(p_email)
    ) INTO v_exists;

    RETURN v_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_guest_get_latest_payment(p_attendance_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_amount integer;
    v_token text;
BEGIN
    v_token := public.get_guest_token();
    IF v_token IS NULL THEN
        RAISE EXCEPTION 'missing guest token';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.attendances a
        WHERE a.id = p_attendance_id AND a.guest_token = v_token
    ) THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    SELECT p.amount
      INTO v_amount
    FROM public.payments p
    WHERE p.attendance_id = p_attendance_id
    ORDER BY p.created_at DESC
    LIMIT 1;

    RETURN v_amount; -- may be null
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_public_get_connect_account(p_event_id uuid, p_creator_id uuid)
RETURNS TABLE (
    stripe_account_id character varying(255),
    payouts_enabled boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    IF NOT public.can_access_event(p_event_id) THEN
        RAISE EXCEPTION 'not allowed';
    END IF;

    RETURN QUERY
    SELECT s.stripe_account_id, s.payouts_enabled
    FROM public.stripe_connect_accounts s
    JOIN public.events e ON e.created_by = s.user_id
    WHERE e.id = p_event_id
      AND e.created_by = p_creator_id
    LIMIT 1;
END;
$$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_payments_attendance_status
  ON public.payments (attendance_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_payments_status_paid
  ON public.payments (status, paid_at) WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_attendances_event_guest
  ON public.attendances (event_id, guest_token);

CREATE INDEX IF NOT EXISTS idx_attendances_event_status
  ON public.attendances (event_id, status);

CREATE INDEX IF NOT EXISTS idx_settlements_event_created
  ON public.settlements (event_id, created_at);

CREATE INDEX IF NOT EXISTS idx_payments_attendance_latest
  ON public.payments (attendance_id, paid_at DESC, created_at DESC, updated_at DESC);

-- ============================================================================
-- SECTION 10: Row Level Security (RLS) Policies
-- ============================================================================

CREATE POLICY "Creators can delete own events" ON "public"."events" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "created_by"));

CREATE POLICY "Creators can insert own events" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));

CREATE POLICY "Creators can update own events" ON "public"."events" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));

CREATE POLICY "Creators can view their own events" ON "public"."events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "created_by"));

CREATE POLICY "Guests can view event organizer stripe accounts" ON "public"."stripe_connect_accounts" FOR SELECT TO "anon" USING ((("public"."get_guest_token"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."attendances" "a"
     JOIN "public"."events" "e" ON (("a"."event_id" = "e"."id")))
  WHERE ((("a"."guest_token")::"text" = "public"."get_guest_token"()) AND ("e"."created_by" = "stripe_connect_accounts"."user_id"))))));

COMMENT ON POLICY "Guests can view event organizer stripe accounts" ON "public"."stripe_connect_accounts" IS 'ゲストトークンを持つ匿名ユーザーが、自身が参加しているイベントの主催者のStripe Connectアカウント情報（決済処理に必要な最小限の情報）にのみアクセス可能';

CREATE POLICY "Safe event access policy" ON "public"."events" FOR SELECT TO "authenticated", "anon" USING ("public"."can_access_event"("id"));

CREATE POLICY "Service role can manage attendances" ON "public"."attendances" FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage payments" ON "public"."payments" FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage settlements" ON "public"."settlements" FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage stripe/payout info" ON "public"."stripe_connect_accounts" FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Users can manage own stripe accounts" ON "public"."stripe_connect_accounts" FOR ALL TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));

CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));

ALTER TABLE "public"."attendances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attendances" FORCE ROW LEVEL SECURITY;

CREATE POLICY "dispute_select_event_owner" ON "public"."payment_disputes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."payments" "p"
     JOIN "public"."attendances" "a" ON (("a"."id" = "p"."attendance_id")))
     JOIN "public"."events" "e" ON (("e"."id" = "a"."event_id")))
  WHERE (("p"."id" = "payment_disputes"."payment_id") AND ("e"."created_by" = "auth"."uid"())))));

CREATE POLICY "event_creators_can_insert_attendances" ON "public"."attendances" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "attendances"."event_id") AND ("e"."created_by" = "auth"."uid"())))));

CREATE POLICY "event_creators_can_insert_payments" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."attendances" "a"
     JOIN "public"."events" "e" ON (("a"."event_id" = "e"."id")))
  WHERE (("a"."id" = "payments"."attendance_id") AND ("e"."created_by" = "auth"."uid"())))));

CREATE POLICY "event_creators_can_update_attendances" ON "public"."attendances" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "attendances"."event_id") AND ("e"."created_by" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "attendances"."event_id") AND ("e"."created_by" = "auth"."uid"())))));

CREATE POLICY "event_creators_can_view_attendances" ON "public"."attendances" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "attendances"."event_id") AND ("e"."created_by" = "auth"."uid"())))));

CREATE POLICY "event_creators_can_view_payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."attendances" "a"
     JOIN "public"."events" "e" ON (("a"."event_id" = "e"."id")))
  WHERE (("a"."id" = "payments"."attendance_id") AND ("e"."created_by" = "auth"."uid"())))));

ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."events" FORCE ROW LEVEL SECURITY;

-- ゲストは自分の参加情報の参照のみ許可（FOR SELECTに限定）
CREATE POLICY "guest_can_select_own_attendance" ON "public"."attendances" FOR SELECT TO "authenticated", "anon" USING ((("guest_token")::"text" = "public"."get_guest_token"()));

CREATE POLICY "guest_token_can_view_own_payments" ON "public"."payments" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."attendances" "a"
  WHERE (("a"."id" = "payments"."attendance_id") AND ("a"."guest_token" IS NOT NULL) AND (("a"."guest_token")::"text" = "public"."get_guest_token"())))));

COMMENT ON POLICY "guest_token_can_view_own_payments" ON "public"."payments" IS 'ゲストトークンを持つユーザーが自分の参加に関連する決済情報を閲覧できるポリシー。';

-- REMOVED: 招待リンク所持者への参加者一覧直接公開はPII漏えいリスクのため削除

ALTER TABLE "public"."payment_disputes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_disputes" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."settlements" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."stripe_connect_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stripe_connect_accounts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "system_logs are accessible only by service_role" ON "public"."system_logs" TO "service_role" USING (true) WITH CHECK (true);

-- fee_config: READ-ONLY singleton, accessed via helper functions or direct SELECT
ALTER TABLE "public"."fee_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fee_config" FORCE ROW LEVEL SECURITY;

CREATE POLICY "fee_config_read_only" ON "public"."fee_config" FOR SELECT TO "authenticated", "service_role" USING (true);

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "users_can_view_own_stripe_accounts" ON "public"."stripe_connect_accounts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

-- ============================================================================
-- SECTION 11: Grants & Ownership (Consolidated)
--  - 集約: 既存のGRANT/REVOKE/OWNER/DEFAULT PRIVILEGESを本セクションに統一
-- ============================================================================

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

-- Public RPC grants for anon role
GRANT EXECUTE ON FUNCTION public.rpc_public_get_event(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_public_attending_count(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_guest_get_attendance() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_public_check_duplicate_email(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_guest_get_latest_payment(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_public_get_connect_account(uuid, uuid) TO anon, authenticated;

-- Function EXECUTEs (authenticated/service_role)
GRANT EXECUTE ON FUNCTION "public"."admin_add_attendance_with_capacity_check"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_bypass_capacity" boolean) TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."calc_refund_dispute_summary"("p_event_id" "uuid") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."can_access_attendance"("p_attendance_id" "uuid") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."can_access_event"("p_event_id" "uuid") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."can_manage_invite_links"("p_event_id" "uuid") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_event_creator_name"("p_creator_id" "uuid") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_guest_token"() TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_min_payout_amount"() TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."register_attendance_with_payment"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."status_rank"("p" "public"."payment_status_enum") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_revenue_summary"("p_event_id" "uuid") TO "authenticated", "service_role";

-- Service role only RPCs
REVOKE EXECUTE ON FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") FROM "authenticated";
GRANT  EXECUTE ON FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") TO   "service_role";
REVOKE EXECUTE ON FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text") FROM "authenticated";
GRANT  EXECUTE ON FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text") TO   "service_role";
REVOKE EXECUTE ON FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text") FROM "authenticated";
GRANT  EXECUTE ON FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text") TO   "service_role";

-- Trigger-only function adjustments
REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION "public"."handle_new_user"() TO "authenticated", "service_role", "supabase_auth_admin";
REVOKE ALL ON FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) TO "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."prevent_payment_status_rollback"() FROM "anon";

-- Tables & sequences
GRANT ALL ON TABLE "public"."attendances" TO "authenticated", "service_role";
GRANT ALL ON TABLE "public"."events"      TO "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."fee_config"  FROM "authenticated"; GRANT SELECT ON TABLE "public"."fee_config" TO "authenticated"; GRANT ALL ON TABLE "public"."fee_config" TO "service_role";
GRANT ALL ON TABLE "public"."payment_disputes" TO "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."payments" FROM "authenticated"; GRANT SELECT ON TABLE "public"."payments" TO "authenticated"; GRANT ALL ON TABLE "public"."payments" TO "service_role";
GRANT ALL ON TABLE "public"."users"       TO "authenticated", "service_role";
GRANT SELECT ON TABLE "public"."public_profiles" TO "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."settlements" FROM "authenticated"; GRANT ALL ON TABLE "public"."settlements" TO "service_role";
GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "authenticated", "service_role";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";
GRANT ALL ON SEQUENCE "public"."system_logs_id_seq" TO "service_role";

-- Default privileges: service_role only (explicit grants for authenticated)
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- Ownership alignment for SECURITY DEFINER functions
ALTER FUNCTION public.admin_add_attendance_with_capacity_check(uuid, character varying, character varying, public.attendance_status_enum, character varying, boolean) OWNER TO app_definer;
ALTER FUNCTION public.calc_refund_dispute_summary(uuid) OWNER TO app_definer;
ALTER FUNCTION public.calc_total_application_fee(uuid) OWNER TO app_definer;
ALTER FUNCTION public.calc_total_stripe_fee(uuid, numeric, integer) OWNER TO app_definer;
ALTER FUNCTION public.can_access_attendance(uuid) OWNER TO app_definer;
ALTER FUNCTION public.can_access_event(uuid) OWNER TO app_definer;
ALTER FUNCTION public.can_manage_invite_links(uuid) OWNER TO app_definer;
ALTER FUNCTION public.check_attendance_capacity_limit() OWNER TO app_definer;
ALTER FUNCTION public.generate_settlement_report(uuid, uuid) OWNER TO app_definer;
ALTER FUNCTION public.get_event_creator_name(uuid) OWNER TO app_definer;
ALTER FUNCTION public.get_guest_token() OWNER TO app_definer;
ALTER FUNCTION public.get_min_payout_amount() OWNER TO app_definer;
ALTER FUNCTION public.get_settlement_report_details(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer, integer) OWNER TO app_definer;
ALTER FUNCTION public.handle_new_user() OWNER TO app_definer;
ALTER FUNCTION public.hash_guest_token(text) OWNER TO app_definer;
ALTER FUNCTION public.prevent_payment_status_rollback() OWNER TO app_definer;
ALTER FUNCTION public.register_attendance_with_payment(uuid, character varying, character varying, public.attendance_status_enum, character varying, public.payment_method_enum, integer) OWNER TO app_definer;
ALTER FUNCTION public.rpc_bulk_update_payment_status_safe(jsonb, uuid, text) OWNER TO app_definer;
ALTER FUNCTION public.rpc_guest_get_attendance() OWNER TO app_definer;
ALTER FUNCTION public.rpc_guest_get_latest_payment(uuid) OWNER TO app_definer;
ALTER FUNCTION public.rpc_public_attending_count(uuid, text) OWNER TO app_definer;
ALTER FUNCTION public.rpc_public_check_duplicate_email(uuid, text) OWNER TO app_definer;
ALTER FUNCTION public.rpc_public_get_connect_account(uuid, uuid) OWNER TO app_definer;
ALTER FUNCTION public.rpc_public_get_event(text) OWNER TO app_definer;
ALTER FUNCTION public.rpc_update_payment_status_safe(uuid, public.payment_status_enum, integer, uuid, text) OWNER TO app_definer;
ALTER FUNCTION public.status_rank(public.payment_status_enum) OWNER TO app_definer;
ALTER FUNCTION public.update_guest_attendance_with_payment(uuid, public.attendance_status_enum, public.payment_method_enum, integer) OWNER TO app_definer;
ALTER FUNCTION public.update_payment_version() OWNER TO app_definer;
ALTER FUNCTION public.update_revenue_summary(uuid) OWNER TO app_definer;
ALTER FUNCTION public.update_updated_at_column() OWNER TO app_definer;

-- Minimize app_definer privileges
REVOKE CREATE ON SCHEMA public FROM app_definer;


RESET ALL;

--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "trigger_handle_new_user" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();
