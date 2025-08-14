-- fee_config テーブルの作成と process_event_payout RPC の更新
-- =============================================================
-- 1. fee_config テーブル（シングルトン設定テーブル）
-- =============================================================
CREATE TABLE IF NOT EXISTS public.fee_config (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  stripe_fee_rate   NUMERIC(5,4)  NOT NULL, -- 例: 0.0360 → 3.6%
  stripe_fixed_fee  INTEGER       NOT NULL, -- 円
  platform_fee_rate NUMERIC(5,4)  NOT NULL,
  platform_fixed_fee INTEGER      NOT NULL,
  min_platform_fee  INTEGER       NOT NULL,
  max_platform_fee  INTEGER       NOT NULL,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 初期値を挿入（既に存在する場合はスキップ）
INSERT INTO public.fee_config (
  id, stripe_fee_rate, stripe_fixed_fee,
  platform_fee_rate, platform_fixed_fee, min_platform_fee, max_platform_fee
) VALUES (
  1, 0.0360, 0,
  0, 0, 0, 0
) ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 2. process_event_payout RPC を fee_config 参照に書き換え
-- =============================================================
CREATE OR REPLACE FUNCTION process_event_payout(
  p_event_id UUID,
  p_user_id  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  payout_id            UUID;
  stripe_sales         INTEGER;
  stripe_fees          INTEGER;
  platform_fees        INTEGER;
  net_amount           INTEGER;
  stripe_account       VARCHAR(255);
  lock_key             BIGINT;
  -- 設定値
  v_stripe_rate        NUMERIC(5,4);
  v_stripe_fixed       INTEGER;
  v_platform_rate      NUMERIC(5,4);
  v_platform_fixed     INTEGER;
  v_min_platform_fee   INTEGER;
  v_max_platform_fee   INTEGER;
BEGIN
  -- fee_config を取得
  SELECT stripe_fee_rate, stripe_fixed_fee,
         platform_fee_rate, platform_fixed_fee,
         min_platform_fee, max_platform_fee
    INTO v_stripe_rate, v_stripe_fixed,
         v_platform_rate, v_platform_fixed,
         v_min_platform_fee, v_max_platform_fee
  FROM public.fee_config WHERE id = 1;

  -- 入力値検証
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id cannot be null';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id cannot be null';
  END IF;

  -- イベント単位のアドバイザリロック
  lock_key := abs(hashtext(p_event_id::text));
  PERFORM pg_advisory_xact_lock(lock_key);

  -- 権限チェック
  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = p_event_id AND created_by = p_user_id
  ) THEN
    RAISE EXCEPTION 'Event not found or not authorized: %', p_event_id;
  END IF;

  -- 既存送金レコードチェック
  IF EXISTS (
    SELECT 1 FROM public.payouts
    WHERE event_id = p_event_id AND status IN ('pending', 'processing', 'completed')
  ) THEN
    RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
  END IF;

  -- Stripe Connect アカウント取得
  SELECT stripe_account_id INTO stripe_account
    FROM public.stripe_connect_accounts
   WHERE user_id = p_user_id AND payouts_enabled = true;
  IF stripe_account IS NULL THEN
    RAISE EXCEPTION 'No verified Stripe Connect account for user: %', p_user_id;
  END IF;

  -- 売上・手数料集計
  SELECT
    COALESCE(SUM(p.amount), 0),
    COALESCE(SUM( ROUND(p.amount * v_stripe_rate) + v_stripe_fixed ), 0),
    COALESCE( GREATEST( LEAST( ROUND(SUM(p.amount) * v_platform_rate) + (COUNT(*) * v_platform_fixed), v_max_platform_fee ), v_min_platform_fee ), 0)
    INTO stripe_sales, stripe_fees, platform_fees
  FROM public.payments p
  JOIN public.attendances a ON p.attendance_id = a.id
  WHERE a.event_id = p_event_id
    AND p.method = 'stripe'
    AND p.status = 'paid';

  net_amount := stripe_sales - stripe_fees - platform_fees;
  IF net_amount <= 0 THEN
    RAISE EXCEPTION 'Net payout amount must be positive, calculated: %', net_amount;
  END IF;

  -- 送金レコードを作成
  INSERT INTO public.payouts (
    event_id, user_id, total_stripe_sales, total_stripe_fee,
    platform_fee, net_payout_amount, stripe_account_id,
    status, transfer_group
  ) VALUES (
    p_event_id, p_user_id, stripe_sales, stripe_fees,
    platform_fees, net_amount, stripe_account,
    'pending', 'event_' || p_event_id::text || '_payout'
  ) RETURNING id INTO payout_id;

  RETURN payout_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Payout already exists or in progress for event_id: %', p_event_id;
END;
$$;

COMMENT ON FUNCTION process_event_payout(UUID, UUID) IS 'イベントの送金処理（fee_config 参照版）';
