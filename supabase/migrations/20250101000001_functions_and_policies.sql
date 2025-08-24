-- ====================================================================
-- EventPay: 統合初期スキーマ第2部 - 関数・トリガー・RLSポリシー
-- 目的: 複雑な関数、トリガー、RLSポリシーの定義
-- ====================================================================

BEGIN;

-- ====================================================================
-- 6. RPC関数群
-- ====================================================================

-- ゲストトークン取得のヘルパー関数（複数の方法をフォールバック）
CREATE OR REPLACE FUNCTION public.get_guest_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
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
    SELECT current_setting('request.headers.x-guest-token', true) INTO token;
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

COMMENT ON FUNCTION public.get_guest_token() IS 'ゲストトークンを複数の方法（JWTクレーム、ヘッダー、設定）から取得するヘルパー関数。フォールバック機能付き。';

-- 決済レコード作成関数
CREATE OR REPLACE FUNCTION public.create_payment_record(
    p_attendance_id UUID,
    p_method public.payment_method_enum,
    p_amount INTEGER
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payment_id UUID;
BEGIN
    -- 入力値検証
    IF p_attendance_id IS NULL THEN
        RAISE EXCEPTION 'attendance_id cannot be null';
    END IF;

    IF p_amount < 0 THEN
        RAISE EXCEPTION 'amount must be non-negative, got: %', p_amount;
    END IF;

    -- 重複チェック
    IF EXISTS (SELECT 1 FROM public.payments WHERE attendance_id = p_attendance_id) THEN
        RAISE EXCEPTION 'Payment record already exists for attendance_id: %', p_attendance_id;
    END IF;

    -- attendanceレコードの存在確認
    IF NOT EXISTS (SELECT 1 FROM public.attendances WHERE id = p_attendance_id) THEN
        RAISE EXCEPTION 'Attendance record not found for id: %', p_attendance_id;
    END IF;

    -- 決済レコード作成
    INSERT INTO public.payments (attendance_id, method, amount, status)
    VALUES (p_attendance_id, p_method, p_amount, 'pending')
    RETURNING id INTO payment_id;

    RETURN payment_id;
END;
$$;

COMMENT ON FUNCTION public.create_payment_record(UUID, public.payment_method_enum, INTEGER) IS '決済レコードを作成する関数';

-- テスト用のヘルパー関数：ゲストトークンを設定
CREATE OR REPLACE FUNCTION public.set_test_guest_token(token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- テスト用設定を使用（セッション全体で有効）
  PERFORM set_config('test.guest_token', token, false);
END;
$$;

-- テスト用のヘルパー関数：ゲストトークンをクリア
CREATE OR REPLACE FUNCTION public.clear_test_guest_token()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- テスト用設定をクリア
  PERFORM set_config('test.guest_token', '', false);
END;
$$;

-- イベント送金処理を実行する関数（最新版）
CREATE OR REPLACE FUNCTION public.process_event_payout(
  p_event_id UUID,
  p_user_id  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payout_id UUID;
    existing_status payout_status_enum;
    stripe_sales INTEGER;
    stripe_fees  INTEGER;
    platform_fees INTEGER := 0; -- MVP では 0 円
    net_amount INTEGER;
    stripe_account VARCHAR(255);
    lock_key BIGINT;
BEGIN
    -- 必須入力チェック
    IF p_event_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'event_id and user_id cannot be null';
    END IF;

    -- イベント固有ロック
    lock_key := abs(hashtext(p_event_id::text));
    PERFORM pg_advisory_xact_lock(lock_key);

    -- 権限＆存在確認
    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id AND created_by = p_user_id AND status = 'past'
    ) THEN
        RAISE EXCEPTION 'Event not found or not authorized: %', p_event_id;
    END IF;

    -- 既存送金レコードチェック（最新行）
    SELECT id, status INTO payout_id, existing_status
    FROM public.payouts
    WHERE event_id = p_event_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF payout_id IS NOT NULL THEN
        -- pending の場合はそのまま再利用して返却
        IF existing_status = 'pending' THEN
            RETURN payout_id;
        ELSIF existing_status = 'failed' THEN
            -- failed を pending にリセットして再利用
            UPDATE public.payouts
            SET status = 'pending',
                stripe_transfer_id = NULL,
                processed_at = NULL,
                last_error = NULL,
                updated_at = now()
            WHERE id = payout_id
            RETURNING id INTO payout_id;

            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
        END IF;
    END IF;

    -- Stripe Connect account (verified & charges_enabled & payouts_enabled) 取得
    SELECT stripe_account_id INTO stripe_account
      FROM public.stripe_connect_accounts
     WHERE user_id = p_user_id
       AND status = 'verified'
       AND charges_enabled = true
       AND payouts_enabled = true;
    IF stripe_account IS NULL THEN
        RAISE EXCEPTION 'No verified Stripe Connect account for user: %', p_user_id;
    END IF;

    -- 売上合計
    SELECT COALESCE(SUM(p.amount),0)::INT INTO stripe_sales
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status = 'paid';

    -- Stripe 手数料 (割合+固定)
    stripe_fees := public.calc_total_stripe_fee(p_event_id);

    -- プラットフォーム手数料 (将来対応) 今は 0

    net_amount := stripe_sales - stripe_fees - platform_fees;

    -- 最小送金金額チェック
    IF net_amount < public.get_min_payout_amount() THEN
        RAISE EXCEPTION 'Net payout amount < minimum (%). Calculated: %', public.get_min_payout_amount(), net_amount;
    END IF;

    -- 送金レコード作成
    INSERT INTO public.payouts (
        event_id, user_id, total_stripe_sales, total_stripe_fee,
        platform_fee, net_payout_amount, stripe_account_id, status, transfer_group
    ) VALUES (
        p_event_id, p_user_id, stripe_sales, stripe_fees,
        platform_fees, net_amount, stripe_account, 'pending',
        'event_' || p_event_id::text || '_payout'
    ) RETURNING id INTO payout_id;

    RETURN payout_id;

EXCEPTION
    WHEN unique_violation THEN
        -- 並行処理でユニーク制約違反が発生した場合、最新 pending / failed を再取得
        SELECT id, status INTO payout_id, existing_status
        FROM public.payouts
        WHERE event_id = p_event_id
        ORDER BY created_at DESC
        LIMIT 1;

        IF payout_id IS NOT NULL AND existing_status IN ('pending', 'failed') THEN
            -- failed の場合はリセットして返す
            IF existing_status = 'failed' THEN
                UPDATE public.payouts
                SET status = 'pending',
                    stripe_transfer_id = NULL,
                    processed_at = NULL,
                    last_error = NULL,
                    updated_at = now()
                WHERE id = payout_id;
            END IF;
            RETURN payout_id;
        ELSE
            RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
        END IF;
END;
$$;

COMMENT ON FUNCTION public.process_event_payout(UUID,UUID) IS 'イベント送金処理：fee_config ベースで手数料・最小送金金額を計算 (verified / charges_enabled / payouts_enabled の三点チェック追加、failed レコードも再利用版)';

-- イベント売上サマリー関数
CREATE OR REPLACE FUNCTION public.update_revenue_summary(
    p_event_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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

    -- 売上集計
    SELECT
        COALESCE(SUM(CASE WHEN p.status IN ('paid','received','completed') THEN p.amount ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN p.method='stripe' AND p.status='paid' THEN p.amount ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN p.method='cash' AND p.status IN ('received','completed') THEN p.amount ELSE 0 END),0),
        COUNT(CASE WHEN p.status IN ('paid','received','completed') THEN 1 END),
        COUNT(CASE WHEN p.status='pending' THEN 1 END)
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

COMMENT ON FUNCTION public.update_revenue_summary(UUID) IS 'イベント売上サマリー: fee_config ベースの手数料計算';

-- 送金対象イベント検索
CREATE OR REPLACE FUNCTION public.find_eligible_events_basic(
    p_days_after_event INTEGER DEFAULT 5,
    p_minimum_amount  INTEGER DEFAULT NULL,
    p_limit           INTEGER DEFAULT 100,
    p_user_id         UUID DEFAULT NULL
) RETURNS TABLE (
    event_id UUID,
    title TEXT,
    event_date DATE,
    fee INTEGER,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    paid_attendances_count INTEGER,
    total_stripe_sales INTEGER
) LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH target_events AS (
        SELECT e.*
          FROM public.events e
         WHERE e.status = 'past'
           AND e.date <= (CURRENT_DATE - p_days_after_event)
           AND (p_user_id IS NULL OR e.created_by = p_user_id)
    ), sales AS (
        SELECT a.event_id, COUNT(*) AS paid_attendances_count, SUM(p.amount)::INT AS total_stripe_sales
          FROM public.attendances a
          JOIN public.payments p ON p.attendance_id = a.id
         WHERE p.method = 'stripe' AND p.status = 'paid'
         GROUP BY a.event_id
    )
    SELECT
        t.id AS event_id,
        t.title,
        t.date AS event_date,
        t.fee,
        t.created_by,
        t.created_at,
        COALESCE(s.paid_attendances_count,0) AS paid_attendances_count,
        COALESCE(s.total_stripe_sales,0)      AS total_stripe_sales
      FROM target_events t
      LEFT JOIN sales s ON s.event_id = t.id
     WHERE COALESCE(s.total_stripe_sales,0) >= COALESCE(p_minimum_amount, public.get_min_payout_amount())
     LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.find_eligible_events_basic(INTEGER,INTEGER,INTEGER,UUID) IS '送金対象イベント検索 (fee_config ベースの最小送金金額利用)';

-- 送金候補イベントを詳細情報付きで取得
CREATE OR REPLACE FUNCTION public.find_eligible_events_with_details(
    p_days_after_event INT DEFAULT 5,
    p_limit INT DEFAULT 50
) RETURNS TABLE (
    event_id UUID,
    title TEXT,
    event_date DATE,
    fee INT,
    created_by UUID,
    created_at TIMESTAMPTZ,
    paid_attendances_count INT,
    total_stripe_sales INT,
    total_stripe_fee INT,
    platform_fee INT,
    net_payout_amount INT,
    charges_enabled BOOLEAN,
    payouts_enabled BOOLEAN,
    eligible BOOLEAN,
    ineligible_reason TEXT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH unpaid_events AS (
        SELECT e.*
        FROM public.events e
        WHERE e.status = 'past'
          AND e.date <= (current_date - p_days_after_event)
        LIMIT p_limit
    ),
    sales AS (
        SELECT a.event_id,
               COUNT(*) FILTER (WHERE p.status = 'paid')                        AS paid_attendances_count,
               COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'),0)::INT AS total_stripe_sales,
               public.calc_total_stripe_fee(a.event_id)                        AS total_stripe_fee
        FROM public.attendances a
        JOIN public.payments p ON p.attendance_id = a.id AND p.method = 'stripe'
        WHERE a.event_id IN (SELECT id FROM unpaid_events)
        GROUP BY a.event_id
    ),
    accounts AS (
        SELECT sca.user_id,
               sca.status,
               sca.charges_enabled,
               sca.payouts_enabled,
               e.id AS event_id
        FROM public.stripe_connect_accounts sca
        JOIN unpaid_events e ON sca.user_id = e.created_by
    )
    SELECT
        ue.id AS event_id,
        ue.title,
        ue.date AS event_date,
        ue.fee,
        ue.created_by,
        ue.created_at,
        COALESCE(s.paid_attendances_count,0),
        COALESCE(s.total_stripe_sales,0),
        COALESCE(s.total_stripe_fee,0),
        0 AS platform_fee,
        (COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0)) AS net_payout_amount,
        COALESCE(a.charges_enabled,false) AS charges_enabled,
        COALESCE(a.payouts_enabled,false) AS payouts_enabled,
        (
          COALESCE(a.status,'unverified') = 'verified' AND
          COALESCE(a.charges_enabled,false) = TRUE AND
          COALESCE(a.payouts_enabled,false) = TRUE AND
          (COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0)) >= public.get_min_payout_amount()
        ) AS eligible,
        CASE
            WHEN COALESCE(a.status,'unverified') <> 'verified' THEN 'Stripe Connectアカウントの認証が完了していません'
            WHEN COALESCE(a.charges_enabled,false) = FALSE THEN 'Stripe Connectアカウントで決済受取が有効になっていません'
            WHEN COALESCE(a.payouts_enabled,false) = FALSE THEN 'Stripe Connectアカウントで送金が有効になっていません'
            WHEN (COALESCE(s.total_stripe_sales,0) - COALESCE(s.total_stripe_fee,0)) < public.get_min_payout_amount() THEN '最小送金額の条件を満たしていません'
            ELSE NULL
        END AS ineligible_reason
    FROM unpaid_events ue
    LEFT JOIN sales s ON s.event_id = ue.id
    LEFT JOIN accounts a ON a.event_id = ue.id;
END;
$$;

COMMENT ON FUNCTION public.find_eligible_events_with_details(INT, INT) IS '送金候補イベントを取得（verified status要件付き、charges_enabled / payouts_enabled チェック）';

-- 送金ステータスを安全に更新する RPC
CREATE OR REPLACE FUNCTION public.update_payout_status_safe(
    _payout_id uuid,
    _from_status public.payout_status_enum,
    _to_status   public.payout_status_enum,
    _processed_at timestamptz default null,
    _stripe_transfer_id text  default null,
    _transfer_group text      default null,
    _last_error text          default null,
    _notes text               default null
) returns void
language plpgsql
as $$
begin
    update public.payouts
    set status             = _to_status,
        updated_at         = now(),
        processed_at       = coalesce(_processed_at, processed_at),
        stripe_transfer_id = coalesce(_stripe_transfer_id, stripe_transfer_id),
        transfer_group     = coalesce(_transfer_group, transfer_group),
        last_error         = coalesce(_last_error, last_error),
        notes              = coalesce(_notes, notes)
    where id = _payout_id
      and status = _from_status;

    if not found then
        raise exception 'payout status conflict or not found'
            using errcode = '40001'; -- serialization_failure 相当
    end if;
end;
$$;

COMMENT ON FUNCTION public.update_payout_status_safe IS '送金ステータスを安全に更新する RPC。TOCTOU 対策として期待ステータスを条件に含める。';

-- スケジューラーロック取得RPC関数
CREATE OR REPLACE FUNCTION public.try_acquire_scheduler_lock(
  p_lock_name text,
  p_ttl_minutes int DEFAULT 180,
  p_process_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _inserted boolean := false;
BEGIN
  -- 期限切れロックの自動削除
  DELETE FROM public.scheduler_locks
  WHERE lock_name = p_lock_name AND expires_at < now();

  -- ロック取得を試行
  BEGIN
    INSERT INTO public.scheduler_locks (
      lock_name,
      acquired_at,
      expires_at,
      process_id,
      metadata
    )
    VALUES (
      p_lock_name,
      now(),
      now() + (p_ttl_minutes || ' minutes')::interval,
      p_process_id,
      p_metadata
    );

    _inserted := true;

  EXCEPTION
    WHEN unique_violation THEN
      -- ロック取得失敗（既に他のプロセスが保持中）
      _inserted := false;
  END;

  RETURN _inserted;
END;
$$;

COMMENT ON FUNCTION public.try_acquire_scheduler_lock IS 'スケジューラーロック取得。TTL付きで自動期限切れを防ぐ';

-- スケジューラーロック解放RPC関数
CREATE OR REPLACE FUNCTION public.release_scheduler_lock(
  p_lock_name text,
  p_process_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _deleted_count int := 0;
BEGIN
  -- process_id が指定されている場合は一致するもののみ削除
  IF p_process_id IS NOT NULL THEN
    DELETE FROM public.scheduler_locks
    WHERE lock_name = p_lock_name
      AND (process_id = p_process_id OR process_id IS NULL);
  ELSE
    -- process_id 未指定の場合は無条件削除
    DELETE FROM public.scheduler_locks
    WHERE lock_name = p_lock_name;
  END IF;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  RETURN _deleted_count > 0;
END;
$$;

COMMENT ON FUNCTION public.release_scheduler_lock IS 'スケジューラーロック解放。process_id指定で安全な解放が可能';

-- 期限切れロック自動削除RPC関数
CREATE OR REPLACE FUNCTION public.cleanup_expired_scheduler_locks()
RETURNS TABLE(
  deleted_count int,
  expired_locks jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _deleted_count int := 0;
  _expired_locks jsonb;
BEGIN
  -- 削除対象の期限切れロック情報を記録
  SELECT jsonb_agg(
    jsonb_build_object(
      'lock_name', lock_name,
      'acquired_at', acquired_at,
      'expires_at', expires_at,
      'process_id', process_id
    )
  ) INTO _expired_locks
  FROM public.scheduler_locks
  WHERE expires_at < now();

  -- 期限切れロックを削除
  DELETE FROM public.scheduler_locks
  WHERE expires_at < now();

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  RETURN QUERY SELECT _deleted_count, COALESCE(_expired_locks, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_scheduler_locks IS '期限切れロックの一括削除。定期的な実行を推奨';

-- ロック状態確認RPC関数（監視・デバッグ用）
CREATE OR REPLACE FUNCTION public.get_scheduler_lock_status(p_lock_name text DEFAULT NULL)
RETURNS TABLE(
  lock_name text,
  acquired_at timestamptz,
  expires_at timestamptz,
  time_remaining_minutes int,
  process_id text,
  metadata jsonb,
  is_expired boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.lock_name,
    sl.acquired_at,
    sl.expires_at,
    EXTRACT(EPOCH FROM (sl.expires_at - now()) / 60)::int as time_remaining_minutes,
    sl.process_id,
    sl.metadata,
    sl.expires_at < now() as is_expired
  FROM public.scheduler_locks sl
  WHERE (p_lock_name IS NULL OR sl.lock_name = p_lock_name)
  ORDER BY sl.acquired_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_scheduler_lock_status IS 'ロック状態の監視・デバッグ用関数';

-- TTL延長RPC関数
CREATE OR REPLACE FUNCTION public.extend_scheduler_lock(
  p_lock_name text,
  p_process_id text,
  p_extend_minutes int DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _updated_count int := 0;
BEGIN
  -- 指定されたプロセスIDのロックのTTLを延長
  UPDATE public.scheduler_locks
  SET expires_at = now() + (p_extend_minutes || ' minutes')::interval,
      metadata = metadata || jsonb_build_object('last_heartbeat', now()::text)
  WHERE lock_name = p_lock_name
    AND process_id = p_process_id
    AND expires_at > now(); -- 期限切れでないことを確認

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  -- 更新できた場合は成功
  RETURN _updated_count > 0;
END;
$$;

COMMENT ON FUNCTION public.extend_scheduler_lock IS 'スケジューラーロックのTTL延長（ハートビート用）。process_id一致時のみ延長可能';

-- 強制的にペイアウトスケジューラーロックを解放するユーティリティ関数
CREATE OR REPLACE FUNCTION public.force_release_payout_scheduler_lock()
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_advisory_unlock(901234);
$$;

COMMENT ON FUNCTION public.force_release_payout_scheduler_lock() IS 'ペイアウトスケジューラーのアドバイザリロックを強制的に解放するユーティリティ関数（緊急時用）';

-- 最新版のイベント清算レポート生成RPC関数
CREATE OR REPLACE FUNCTION public.generate_settlement_report(
    p_event_id UUID,
    p_organizer_id UUID
) RETURNS TABLE (
    report_id UUID,
    already_exists BOOLEAN,
    event_id UUID,
    event_title VARCHAR(255),
    event_date DATE,
    organizer_id UUID,
    stripe_account_id VARCHAR(255),
    transfer_group TEXT,
    total_stripe_sales INTEGER,
    total_stripe_fee INTEGER,
    total_application_fee INTEGER,
    net_payout_amount INTEGER,
    payment_count INTEGER,
    refunded_count INTEGER,
    total_refunded_amount INTEGER,
    settlement_mode TEXT,
    generated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_transfer_group TEXT;
    v_refund_data JSON;
    v_was_update BOOLEAN := FALSE;
    v_generated_at TIMESTAMPTZ;
    v_updated_at TIMESTAMPTZ;
BEGIN
    -- Validation
    IF p_event_id IS NULL OR p_organizer_id IS NULL THEN
        RAISE EXCEPTION 'event_id and organizer_id are required';
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
     WHERE e.id = p_event_id
       AND e.created_by = p_organizer_id
       AND sca.payouts_enabled = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found or organizer not authorized, or Stripe Connect account not ready';
    END IF;

    -- Correlation key for Transfers
    v_transfer_group := 'event_' || p_event_id::text || '_payout';

    -- Aggregate sales: include both paid & refunded Stripe payments
    SELECT COALESCE(SUM(p.amount), 0)::INT,
           COUNT(*)::INT
      INTO v_stripe_sales,
           v_payment_count
      FROM public.payments p
      JOIN public.attendances a ON p.attendance_id = a.id
     WHERE a.event_id = p_event_id
       AND p.method = 'stripe'
       AND p.status IN ('paid', 'refunded');

    -- Stripe platform fee (platform cost – not used in net calc)
    v_stripe_fee := public.calc_total_stripe_fee(p_event_id);

    -- Application fee (gross)
    v_application_fee := public.calc_total_application_fee(p_event_id);

    -- Refund summary JSON
    v_refund_data := public.calc_refund_dispute_summary(p_event_id);
    IF v_refund_data IS NOT NULL THEN
        v_total_refunded_amount  := COALESCE((v_refund_data ->> 'totalRefundedAmount')::INT, 0);
        v_total_app_fee_refunded := COALESCE((v_refund_data ->> 'totalApplicationFeeRefunded')::INT, 0);
        v_refunded_count         := COALESCE((v_refund_data ->> 'refundedCount')::INT, 0);
    END IF;

    -- Net application fee (cannot be negative)
    v_net_application_fee := GREATEST(v_application_fee - v_total_app_fee_refunded, 0);

    -- Net payout amount (Stripe fee is platform-borne)
    v_net_amount := (v_stripe_sales - v_total_refunded_amount) - v_net_application_fee;

    -- Atomic upsert by (event_id, JST date)
    INSERT INTO public.payouts (
        event_id,
        user_id,
        total_stripe_sales,
        total_stripe_fee,
        platform_fee,
        net_payout_amount,
        stripe_account_id,
        transfer_group,
        settlement_mode,
        status,
        generated_at,
        updated_at
    ) VALUES (
        p_event_id,
        p_organizer_id,
        v_stripe_sales,
        v_stripe_fee,
        v_net_application_fee,
        v_net_amount,
        v_event_data.stripe_account_id,
        v_transfer_group,
        'destination_charge',
        'completed',
        now(),
        now()
    )
    ON CONFLICT ON CONSTRAINT uniq_payouts_event_generated_date_jst DO UPDATE SET
        total_stripe_sales = EXCLUDED.total_stripe_sales,
        total_stripe_fee   = EXCLUDED.total_stripe_fee,
        platform_fee       = EXCLUDED.platform_fee,
        net_payout_amount  = EXCLUDED.net_payout_amount,
        updated_at         = now()
    RETURNING id, (xmax = 0), public.payouts.generated_at, public.payouts.updated_at
    INTO v_payout_id, v_was_update, v_generated_at, v_updated_at;

    -- Return enriched record
    report_id := v_payout_id;
    already_exists := NOT v_was_update;
    event_id := p_event_id;
    event_title := v_event_data.title;
    event_date := v_event_data.date;
    organizer_id := p_organizer_id;
    stripe_account_id := v_event_data.stripe_account_id;
    transfer_group := v_transfer_group;
    total_stripe_sales := v_stripe_sales;
    total_stripe_fee := v_stripe_fee;
    total_application_fee := v_net_application_fee;
    net_payout_amount := v_net_amount;
    payment_count := v_payment_count;
    refunded_count := v_refunded_count;
    total_refunded_amount := v_total_refunded_amount;
    settlement_mode := 'destination_charge';
    generated_at := v_generated_at;
    updated_at := v_updated_at;

    RETURN;
END;
$$;

COMMENT ON FUNCTION public.generate_settlement_report(UUID, UUID) IS 'Generate settlement report (destination charges). Includes refunded payments in sales aggregation and excludes Stripe fee from net payout.';

-- 清算レポート詳細取得関数
CREATE OR REPLACE FUNCTION public.get_settlement_report_details(
    p_organizer_id UUID,
    p_event_ids UUID[] DEFAULT NULL,
    p_from_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
    report_id UUID,
    event_id UUID,
    event_title TEXT,
    event_date DATE,
    stripe_account_id VARCHAR(255),
    transfer_group VARCHAR(255),
    generated_at TIMESTAMP WITH TIME ZONE,

    total_stripe_sales INTEGER,
    total_stripe_fee INTEGER,
    total_application_fee INTEGER,
    net_payout_amount INTEGER,

    payment_count INTEGER,
    refunded_count INTEGER,
    total_refunded_amount INTEGER,

    settlement_mode settlement_mode_enum,
    status payout_status_enum
)
LANGUAGE plpgsql
SECURITY DEFINER
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

        -- 決済件数を動的に取得
        (
            SELECT COUNT(*)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.status = 'paid'
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
        ) AS total_refunded_amount,

        p.settlement_mode,
        p.status
    FROM public.payouts p
    JOIN public.events e ON p.event_id = e.id
    WHERE p.user_id = p_organizer_id
      AND p.settlement_mode = 'destination_charge'
      AND (p_event_ids IS NULL OR p.event_id = ANY(p_event_ids))
      AND (p_from_date IS NULL OR p.generated_at >= p_from_date)
      AND (p_to_date IS NULL OR p.generated_at <= p_to_date)
    ORDER BY p.generated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_settlement_report_details(UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER)
IS '清算レポート一覧を詳細情報付きで取得（destination charges用）';

-- Continued in next part...
COMMIT;
