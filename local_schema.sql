


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


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS '清算RPC関数のクリーンアップ完了 - 一貫性のないロジックを持つ未使用関数を削除 (calc_payout_amount, process_event_payout, get_settlement_aggregations)';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."attendance_status_enum" AS ENUM (
    'attending',
    'not_attending',
    'maybe'
);


ALTER TYPE "public"."attendance_status_enum" OWNER TO "postgres";


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



CREATE TYPE "public"."security_severity_enum" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);


ALTER TYPE "public"."security_severity_enum" OWNER TO "postgres";


CREATE TYPE "public"."stripe_account_status_enum" AS ENUM (
    'unverified',
    'onboarding',
    'verified',
    'restricted'
);


ALTER TYPE "public"."stripe_account_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."suspicious_activity_type_enum" AS ENUM (
    'EMPTY_RESULT_SET',
    'ADMIN_ACCESS_ATTEMPT',
    'INVALID_TOKEN_PATTERN',
    'RATE_LIMIT_EXCEEDED',
    'UNAUTHORIZED_RLS_BYPASS',
    'BULK_DATA_ACCESS',
    'UNUSUAL_ACCESS_PATTERN'
);


ALTER TYPE "public"."suspicious_activity_type_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_add_attendance_with_capacity_check"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_bypass_capacity" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
  v_current_user_id := auth.uid();
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


COMMENT ON FUNCTION "public"."admin_add_attendance_with_capacity_check"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_bypass_capacity" boolean) IS '主催者用参加者追加関数（レースコンディション対策付き）。排他ロックによる定員チェックと主催者権限確認を実行。';



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


COMMENT ON FUNCTION "public"."calc_refund_dispute_summary"("p_event_id" "uuid") IS 'イベント単位の返金・Dispute集計（won以外のDisputeを控除対象とする）';



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


COMMENT ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") IS 'イベント単位でアプリケーション手数料（プラットフォーム手数料）を合計計算。部分返金された決済も含める。';



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


COMMENT ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) IS 'Calculate total Stripe fees for an event, including both paid and refunded payments. Prefers stored balance_transaction fee per payment; fallback to rate+fixed calculation if missing.';



CREATE OR REPLACE FUNCTION "public"."can_access_attendance"("p_attendance_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
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


COMMENT ON FUNCTION "public"."can_access_attendance"("p_attendance_id" "uuid") IS '参加者情報アクセス権限チェック関数。イベントアクセス権限またはゲストトークンによるアクセスをチェック。';



CREATE OR REPLACE FUNCTION "public"."can_access_event"("p_event_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  current_user_id UUID;
  invite_token_var TEXT;
  guest_token_var TEXT;
BEGIN
  current_user_id := auth.uid();

  BEGIN
    invite_token_var := current_setting('request.headers', true)::json->>'x-invite-token';
  EXCEPTION WHEN OTHERS THEN
    invite_token_var := NULL;
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

  IF invite_token_var IS NOT NULL AND invite_token_var != '' THEN
    IF EXISTS (
      SELECT 1 FROM events
      WHERE id = p_event_id
        AND events.invite_token = invite_token_var
        AND events.canceled_at IS NULL
        AND events.date > NOW()
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


COMMENT ON FUNCTION "public"."can_access_event"("p_event_id" "uuid") IS 'イベントアクセス権限チェック関数。主催者権限、招待トークン、ゲストトークンによるアクセスを安全にチェック。循環参照なし。';



CREATE OR REPLACE FUNCTION "public"."can_manage_invite_links"("p_event_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

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


COMMENT ON FUNCTION "public"."can_manage_invite_links"("p_event_id" "uuid") IS '招待リンク管理権限チェック関数。イベント主催者のみが管理可能。';



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


CREATE OR REPLACE FUNCTION "public"."clear_test_guest_token"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- テスト用設定をクリア
  PERFORM set_config('test.guest_token', '', false);
END;
$$;


ALTER FUNCTION "public"."clear_test_guest_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") RETURNS TABLE("report_id" "uuid", "already_exists" boolean, "returned_event_id" "uuid", "event_title" character varying, "event_date" timestamp with time zone, "created_by" "uuid", "stripe_account_id" character varying, "transfer_group" "text", "total_stripe_sales" integer, "total_stripe_fee" integer, "total_application_fee" integer, "net_payout_amount" integer, "payment_count" integer, "refunded_count" integer, "total_refunded_amount" integer, "dispute_count" integer, "total_disputed_amount" integer, "report_generated_at" timestamp with time zone, "report_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
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
    already_exists := NOT v_was_update;
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
    AS $$
BEGIN
    RETURN (SELECT name FROM public.users WHERE id = p_creator_id);
END;
$$;


ALTER FUNCTION "public"."get_event_creator_name"("p_creator_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_guest_token"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
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
  -- 正しい形式: current_setting('request.headers', true)::json->>'header-name'
  BEGIN
    SELECT current_setting('request.headers', true)::json->>'x-guest-token' INTO token;
    IF token IS NOT NULL AND token != '' THEN
      RETURN token;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- 続行
  END;

  -- 3. アプリケーション設定から取得（テスト用）
  BEGIN
    SELECT current_setting('app.guest_token', true) INTO token;
    IF token IS NOT NULL AND token != '' THEN
      RETURN token;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- 続行
  END;

  -- 4. テスト用の直接設定（テスト環境専用）
  BEGIN
    SELECT current_setting('test.guest_token', true) INTO token;
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


COMMENT ON FUNCTION "public"."get_guest_token"() IS 'ゲストトークンを複数の方法（JWTクレーム、ヘッダー、設定）から取得するヘルパー関数。フォールバック機能付き。正しいヘッダーアクセス形式を使用。';



CREATE OR REPLACE FUNCTION "public"."get_min_payout_amount"() RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
    SELECT COALESCE((SELECT min_payout_amount FROM public.fee_config LIMIT 1), 100);
$$;


ALTER FUNCTION "public"."get_min_payout_amount"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_min_payout_amount"() IS '最小送金金額（円）を返すユーティリティ関数。fee_config に設定が無い場合はデフォルト 100 円。';



CREATE OR REPLACE FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_from_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("report_id" "uuid", "event_id" "uuid", "event_title" character varying, "event_date" timestamp with time zone, "stripe_account_id" character varying, "transfer_group" character varying, "generated_at" timestamp with time zone, "total_stripe_sales" integer, "total_stripe_fee" integer, "total_application_fee" integer, "net_payout_amount" integer, "payment_count" integer, "refunded_count" integer, "total_refunded_amount" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
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
    AS $$
BEGIN
    RETURN encode(digest(token, 'sha256'), 'hex');
END;
$$;


ALTER FUNCTION "public"."hash_guest_token"("token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."hash_guest_token"("token" "text") IS 'ゲストトークンをSHA-256でハッシュ化する関数（監査ログ用）';



CREATE OR REPLACE FUNCTION "public"."prevent_payment_status_rollback"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- キャンセル操作（セッション変数でフラグ設定）の場合は遷移チェックをスキップ
    IF current_setting('app.allow_payment_cancel', true) = 'true' THEN
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
    RAISE EXCEPTION 'Guest token already exists: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  -- 1. attendancesテーブルに参加記録を挿入
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
      -- 【レースコンディション対策】UNIQUE制約違反の適切な処理
      DECLARE
        v_constraint_name TEXT;
        v_capacity_recheck INTEGER;
        v_current_count_recheck INTEGER;
      BEGIN
        -- 違反した制約名を取得
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

        -- メールアドレス重複の場合、定員超過の可能性をチェック
        IF v_constraint_name = 'attendances_event_email_unique' OR SQLERRM LIKE '%attendances_event_email_unique%' THEN
          -- 容量を再チェックして、本当に定員超過が原因かを確認
          SELECT capacity INTO v_capacity_recheck FROM public.events WHERE id = p_event_id;

          IF v_capacity_recheck IS NOT NULL THEN
            SELECT COUNT(*) INTO v_current_count_recheck
            FROM public.attendances
            WHERE event_id = p_event_id AND status = 'attending';

            -- 定員に達している場合、適切なエラーメッセージを返す
            IF v_current_count_recheck >= v_capacity_recheck THEN
              RAISE EXCEPTION 'このイベントは定員（%名）に達しています', v_capacity_recheck
                USING ERRCODE = 'P0001',
                      DETAIL = format('Race condition detected and resolved: attendees=%s, capacity=%s', v_current_count_recheck, v_capacity_recheck),
                      HINT = 'Concurrent registration attempt blocked';
            END IF;
          END IF;

          -- 真の重複の場合
          RAISE EXCEPTION 'このメールアドレスは既にこのイベントに登録されています'
            USING ERRCODE = '23505',
                  DETAIL = format('Email already registered for event %s', p_event_id);

        -- ゲストトークン重複の場合
        ELSIF v_constraint_name = 'attendances_guest_token_key' OR SQLERRM LIKE '%guest_token%' THEN
          RAISE EXCEPTION 'Guest token already exists (concurrent request detected): %', LEFT(p_guest_token, 8) || '...'
            USING ERRCODE = '23505',
                  DETAIL = 'This may indicate a race condition or duplicate request';

        -- その他のUNIQUE制約違反
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
  IF p_status = 'attending' AND p_event_fee IS NOT NULL AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
    BEGIN
      INSERT INTO public.payments (attendance_id, amount, method, status)
      VALUES (v_attendance_id, p_event_fee, p_payment_method, 'pending');
    EXCEPTION
      WHEN OTHERS THEN
        -- 決済記録の挿入に失敗した場合、参加記録も削除してロールバック
        DELETE FROM public.attendances WHERE id = v_attendance_id;
        RAISE EXCEPTION 'Failed to insert payment record: %', SQLERRM;
    END;
  END IF;

  RETURN v_attendance_id;
END;
$_$;


ALTER FUNCTION "public"."register_attendance_with_payment"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."register_attendance_with_payment"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) IS 'イベント参加登録と決済レコード作成を一括で実行する関数（gst_形式トークン対応）';



CREATE OR REPLACE FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
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

  -- 一括処理の監査ログ
  INSERT INTO system_logs (operation_type, details, created_at)
  VALUES (
    'payment_bulk_status_update_safe',
    jsonb_build_object(
      'user_id', p_user_id,
      'total_count', jsonb_array_length(p_payment_updates),
      'success_count', v_success_count,
      'failure_count', v_failure_count,
      'failures', v_failures,
      'notes', p_notes
    ),
    now()
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


COMMENT ON FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text") IS 'Bulk payment status update with optimistic locking and detailed failure reporting';



CREATE OR REPLACE FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_updated_rows     integer;
  v_payment_record   payments%ROWTYPE;
  v_attendance_record attendances%ROWTYPE;
  v_event_record     events%ROWTYPE;
  v_result           json;
BEGIN
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
    PERFORM set_config('app.allow_payment_cancel', 'true', true);
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
    PERFORM set_config('app.allow_payment_cancel', 'false', true);
  END IF;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- バージョン競合検出
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Concurrent update detected for payment %', p_payment_id
      USING ERRCODE = '40001'; -- serialization_failure
  END IF;

  -- 3. 監査ログ記録
  INSERT INTO system_logs (operation_type, details, created_at)
  VALUES (
    'payment_status_update_safe',
    jsonb_build_object(
      'payment_id', p_payment_id,
      'old_status', v_payment_record.status,
      'new_status', p_new_status,
      'expected_version', p_expected_version,
      'new_version', v_payment_record.version + 1,
      'user_id', p_user_id,
      'notes', p_notes,
      'event_id', v_event_record.id,
      'attendance_id', v_attendance_record.id
    ),
    now()
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


COMMENT ON FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text") IS 'Optimistic-lock aware payment status update with audit logging';



CREATE OR REPLACE FUNCTION "public"."set_test_guest_token"("token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- テスト用設定を使用（セッション全体で有効）
  PERFORM set_config('test.guest_token', token, false);
END;
$$;


ALTER FUNCTION "public"."set_test_guest_token"("token" "text") OWNER TO "postgres";


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


COMMENT ON FUNCTION "public"."status_rank"("p" "public"."payment_status_enum") IS 'Returns precedence rank of payment statuses. Higher is more terminal (prevents rollback). Updated to include canceled (rank 35).';



CREATE OR REPLACE FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum" DEFAULT NULL::"public"."payment_method_enum", "p_event_fee" integer DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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
BEGIN
  -- 参加記録の存在確認と現在のステータス取得
  SELECT event_id, status INTO v_event_id, v_current_status
  FROM public.attendances
  WHERE id = p_attendance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found';
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

        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'payment_canceled',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'previousStatus', v_payment_status,
            'newStatus', 'canceled',
            'attendanceStatus', p_status
          )
        );
      ELSIF v_payment_status IN ('paid', 'received') THEN
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'payment_status_maintained_on_cancel',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'paymentStatus', v_payment_status,
            'paymentMethod', v_payment_method,
            'attendanceStatus', p_status
          )
        );
      ELSIF v_payment_status = 'waived' THEN
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'waived_payment_kept',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'paymentStatus', v_payment_status,
            'attendanceStatus', p_status
          )
        );
      ELSIF v_payment_status = 'canceled' THEN
        -- 再キャンセル時は重複ログを避けるため控えめな監査ログのみ記録
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'payment_canceled_duplicate',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'paymentStatus', v_payment_status,
            'attendanceStatus', p_status
          )
        );
      ELSIF v_payment_status = 'refunded' THEN
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'refund_status_maintained_on_cancel',
          jsonb_build_object(
            'attendanceId', p_attendance_id,
            'paymentId', v_payment_id,
            'paymentStatus', v_payment_status,
            'attendanceStatus', p_status
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;


ALTER FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) IS 'ゲスト参加状況更新と決済処理（参加キャンセル時の決済処理安全化版）';



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


COMMENT ON FUNCTION "public"."update_revenue_summary"("p_event_id" "uuid") IS 'イベント売上サマリー: fee_config ベースの手数料計算。canceled/refunded を売上・未収から除外。入金があれば参加状態に関わらず売上として計上。';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

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
    CONSTRAINT "attendances_nickname_check" CHECK (("length"(TRIM(BOTH FROM "nickname")) >= 1))
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
    CONSTRAINT "events_payment_deadline_after_registration" CHECK ((("payment_deadline" IS NULL) OR ("registration_deadline" IS NULL) OR ("payment_deadline" >= "registration_deadline"))),
    CONSTRAINT "events_payment_deadline_required_if_stripe" CHECK (((NOT ('stripe'::"public"."payment_method_enum" = ANY ("payment_methods"))) OR ("payment_deadline" IS NOT NULL))),
    CONSTRAINT "events_payment_deadline_within_30d_after_date" CHECK ((("payment_deadline" IS NULL) OR ("payment_deadline" <= ("date" + '30 days'::interval)))),
    CONSTRAINT "events_payment_methods_check" CHECK (("array_length"("payment_methods", 1) > 0)),
    CONSTRAINT "events_registration_deadline_before_event" CHECK ((("registration_deadline" IS NULL) OR ("registration_deadline" <= "date")))
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



COMMENT ON COLUMN "public"."fee_config"."stripe_base_rate" IS 'Stripe 決済手数料の割合 (0.039 = 3.9%)';



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
    CONSTRAINT "payouts_amounts_non_negative" CHECK ((("total_stripe_sales" >= 0) AND ("total_stripe_fee" >= 0) AND ("platform_fee" >= 0) AND ("net_payout_amount" >= 0))),
    CONSTRAINT "payouts_calculation_reasonable" CHECK ((("net_payout_amount" <= "total_stripe_sales") AND ("net_payout_amount" >= 0)))
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
    "operation_type" character varying(50) NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_logs" IS 'システムログテーブル';



CREATE SEQUENCE IF NOT EXISTS "public"."system_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."system_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."system_logs_id_seq" OWNED BY "public"."system_logs"."id";



ALTER TABLE ONLY "public"."system_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."system_logs_id_seq"'::"regclass");



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
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_stripe_account_id_key" UNIQUE ("stripe_account_id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "attendances_event_email_unique" ON "public"."attendances" USING "btree" ("event_id", "email");



CREATE INDEX "idx_attendances_event_id" ON "public"."attendances" USING "btree" ("event_id");



CREATE INDEX "idx_attendances_event_id_guest_token" ON "public"."attendances" USING "btree" ("event_id", "guest_token") WHERE (("guest_token" IS NOT NULL) AND (("guest_token")::"text" ~ '^gst_[a-zA-Z0-9_-]{32}$'::"text"));



CREATE INDEX "idx_attendances_event_id_id" ON "public"."attendances" USING "btree" ("event_id", "id");



CREATE INDEX "idx_attendances_guest_token" ON "public"."attendances" USING "btree" ("guest_token") WHERE ("guest_token" IS NOT NULL);



CREATE INDEX "idx_attendances_guest_token_active" ON "public"."attendances" USING "btree" ("guest_token") WHERE (("guest_token" IS NOT NULL) AND (("guest_token")::"text" ~ '^gst_[a-zA-Z0-9_-]{32}$'::"text"));



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



CREATE INDEX "idx_payments_stripe_payment_intent" ON "public"."payments" USING "btree" ("stripe_payment_intent_id");



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



CREATE UNIQUE INDEX "uniq_settlements_event_generated_date_jst" ON "public"."settlements" USING "btree" ("event_id", ((("generated_at" AT TIME ZONE 'Asia/Tokyo'::"text"))::"date"));



CREATE UNIQUE INDEX "unique_open_payment_per_attendance" ON "public"."payments" USING "btree" ("attendance_id") WHERE ("status" = 'pending'::"public"."payment_status_enum");



CREATE OR REPLACE TRIGGER "check_attendance_capacity_before_insert_or_update" BEFORE INSERT OR UPDATE ON "public"."attendances" FOR EACH ROW EXECUTE FUNCTION "public"."check_attendance_capacity_limit"();



CREATE OR REPLACE TRIGGER "trg_prevent_payment_status_rollback" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_payment_status_rollback"();



CREATE OR REPLACE TRIGGER "trigger_update_payment_version" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_payment_version"();



CREATE OR REPLACE TRIGGER "update_attendances_updated_at" BEFORE UPDATE ON "public"."attendances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_events_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_settlements_updated_at" BEFORE UPDATE ON "public"."settlements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_stripe_connect_accounts_updated_at" BEFORE UPDATE ON "public"."stripe_connect_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



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
    ADD CONSTRAINT "payouts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Creators can delete own events" ON "public"."events" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Creators can insert own events" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Creators can update own events" ON "public"."events" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Creators can view payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."attendances" "a"
     JOIN "public"."events" "e" ON (("a"."event_id" = "e"."id")))
  WHERE (("a"."id" = "payments"."attendance_id") AND ("e"."created_by" = "auth"."uid"())))));



CREATE POLICY "Guest token update payment details" ON "public"."payments" FOR UPDATE TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM ("public"."attendances" "a"
     JOIN "public"."events" "e" ON (("a"."event_id" = "e"."id")))
  WHERE (("a"."id" = "payments"."attendance_id") AND ("a"."guest_token" IS NOT NULL) AND (("a"."guest_token")::"text" = "public"."get_guest_token"()) AND ("e"."canceled_at" IS NULL) AND (("e"."payment_deadline" IS NULL) OR ("e"."payment_deadline" > "now"())) AND ("e"."date" > "now"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."attendances" "a"
     JOIN "public"."events" "e" ON (("a"."event_id" = "e"."id")))
  WHERE (("a"."id" = "payments"."attendance_id") AND ("a"."guest_token" IS NOT NULL) AND (("a"."guest_token")::"text" = "public"."get_guest_token"()) AND ("e"."canceled_at" IS NULL) AND (("e"."payment_deadline" IS NULL) OR ("e"."payment_deadline" > "now"())) AND ("e"."date" > "now"())))));



CREATE POLICY "Guests can view event organizer stripe accounts" ON "public"."stripe_connect_accounts" FOR SELECT TO "anon" USING ((("public"."get_guest_token"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."attendances" "a"
     JOIN "public"."events" "e" ON (("a"."event_id" = "e"."id")))
  WHERE ((("a"."guest_token")::"text" = "public"."get_guest_token"()) AND ("e"."created_by" = "stripe_connect_accounts"."user_id"))))));



COMMENT ON POLICY "Guests can view event organizer stripe accounts" ON "public"."stripe_connect_accounts" IS 'ゲストトークンを持つ匿名ユーザーが、自身が参加しているイベントの主催者のStripe Connectアカウント情報（決済処理に必要な最小限の情報）にのみアクセス可能';



CREATE POLICY "Safe event access policy" ON "public"."events" FOR SELECT TO "authenticated", "anon" USING ("public"."can_access_event"("id"));



CREATE POLICY "Service role can access system logs" ON "public"."system_logs" TO "service_role" USING (true);



CREATE POLICY "Service role can manage attendances" ON "public"."attendances" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage payments" ON "public"."payments" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage settlements" ON "public"."settlements" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage stripe/payout info" ON "public"."stripe_connect_accounts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Users can insert their own events" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



COMMENT ON POLICY "Users can insert their own events" ON "public"."events" IS '認証済みユーザーが自分のイベント(created_by = auth.uid())を作成できるようにするポリシー';



CREATE POLICY "Users can manage own stripe accounts" ON "public"."stripe_connect_accounts" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."attendances" ENABLE ROW LEVEL SECURITY;


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


CREATE POLICY "guest_token_can_access_own_attendance" ON "public"."attendances" TO "authenticated", "anon" USING ((("guest_token")::"text" = "public"."get_guest_token"())) WITH CHECK ((("guest_token")::"text" = "public"."get_guest_token"()));



CREATE POLICY "guest_token_can_view_own_payments" ON "public"."payments" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."attendances" "a"
  WHERE (("a"."id" = "payments"."attendance_id") AND ("a"."guest_token" IS NOT NULL) AND (("a"."guest_token")::"text" = "public"."get_guest_token"())))));



COMMENT ON POLICY "guest_token_can_view_own_payments" ON "public"."payments" IS 'ゲストトークンを持つユーザーが自分の参加に関連する決済情報を閲覧できるポリシー。既存のUPDATEポリシーに対応するSELECTポリシー。';



CREATE POLICY "invite_token_can_view_attendances" ON "public"."attendances" FOR SELECT TO "authenticated", "anon" USING ("public"."can_access_event"("event_id"));



COMMENT ON POLICY "invite_token_can_view_attendances" ON "public"."attendances" IS '招待トークンを持つユーザーがイベントの参加者情報を閲覧可能にする。定員判定のための参加者数カウントに使用される。';



ALTER TABLE "public"."payment_disputes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_connect_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_can_view_own_stripe_accounts" ON "public"."stripe_connect_accounts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."admin_add_attendance_with_capacity_check"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_bypass_capacity" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_add_attendance_with_capacity_check"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_bypass_capacity" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_add_attendance_with_capacity_check"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_bypass_capacity" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_refund_dispute_summary"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_refund_dispute_summary"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_refund_dispute_summary"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_total_application_fee"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_total_stripe_fee"("p_event_id" "uuid", "p_base_rate" numeric, "p_fixed_fee" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_attendance"("p_attendance_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_attendance"("p_attendance_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_attendance"("p_attendance_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_event"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_event"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_event"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_invite_links"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_invite_links"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_invite_links"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_attendance_capacity_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_attendance_capacity_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_attendance_capacity_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_test_guest_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_test_guest_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_test_guest_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_settlement_report"("input_event_id" "uuid", "input_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_event_creator_name"("p_creator_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_event_creator_name"("p_creator_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_event_creator_name"("p_creator_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_guest_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_guest_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_guest_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_min_payout_amount"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_min_payout_amount"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_min_payout_amount"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."hash_guest_token"("token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hash_guest_token"("token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hash_guest_token"("token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_payment_status_rollback"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_payment_status_rollback"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_payment_status_rollback"() TO "service_role";



GRANT ALL ON FUNCTION "public"."register_attendance_with_payment"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."register_attendance_with_payment"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_attendance_with_payment"("p_event_id" "uuid", "p_nickname" character varying, "p_email" character varying, "p_status" "public"."attendance_status_enum", "p_guest_token" character varying, "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_bulk_update_payment_status_safe"("p_payment_updates" "jsonb", "p_user_id" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_update_payment_status_safe"("p_payment_id" "uuid", "p_new_status" "public"."payment_status_enum", "p_expected_version" integer, "p_user_id" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_test_guest_token"("token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_test_guest_token"("token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_test_guest_token"("token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."status_rank"("p" "public"."payment_status_enum") TO "anon";
GRANT ALL ON FUNCTION "public"."status_rank"("p" "public"."payment_status_enum") TO "authenticated";
GRANT ALL ON FUNCTION "public"."status_rank"("p" "public"."payment_status_enum") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_guest_attendance_with_payment"("p_attendance_id" "uuid", "p_status" "public"."attendance_status_enum", "p_payment_method" "public"."payment_method_enum", "p_event_fee" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_payment_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_payment_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_payment_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_revenue_summary"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_revenue_summary"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_revenue_summary"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."attendances" TO "anon";
GRANT ALL ON TABLE "public"."attendances" TO "authenticated";
GRANT ALL ON TABLE "public"."attendances" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."fee_config" TO "anon";
GRANT ALL ON TABLE "public"."fee_config" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_config" TO "service_role";



GRANT ALL ON TABLE "public"."payment_disputes" TO "anon";
GRANT ALL ON TABLE "public"."payment_disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_disputes" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."public_profiles" TO "anon";
GRANT ALL ON TABLE "public"."public_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."public_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."settlements" TO "anon";
GRANT ALL ON TABLE "public"."settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."settlements" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "anon";
GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."system_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_logs_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































RESET ALL;
