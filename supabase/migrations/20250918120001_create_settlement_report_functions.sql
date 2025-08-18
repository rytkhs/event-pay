-- ====================================================================
-- Settlement Report Functions for Destination Charges
-- 目的: Destination charges でのイベント清算レポート生成用のRPC関数
-- ====================================================================

-- 1. イベント単位でのアプリケーション手数料集計関数
CREATE OR REPLACE FUNCTION public.calc_total_application_fee(
    p_event_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
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
      AND p.status = 'paid';

    RETURN v_total_fee;
END;
$$;

COMMENT ON FUNCTION public.calc_total_application_fee(UUID) IS 'イベント単位でアプリケーション手数料（プラットフォーム手数料）を合計計算';

-- 2. イベント単位での返金・異議集計関数
CREATE OR REPLACE FUNCTION public.calc_refund_dispute_summary(
    p_event_id UUID
) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_refunded_amount INTEGER := 0;
    v_refunded_count INTEGER := 0;
    v_total_app_fee_refunded INTEGER := 0;
    v_result JSON;
BEGIN
    -- 返金データの集計
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

    -- JSON形式で結果を返す
    v_result := json_build_object(
        'totalRefundedAmount', v_total_refunded_amount,
        'refundedCount', v_refunded_count,
        'totalApplicationFeeRefunded', v_total_app_fee_refunded,
        'totalDisputedAmount', 0,  -- TODO: 将来的にDispute対応時に実装
        'disputeCount', 0         -- TODO: 将来的にDispute対応時に実装
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calc_refund_dispute_summary(UUID) IS 'イベント単位での返金・異議情報をJSON形式で集計';

-- 3. イベント清算レポート生成RPC関数
CREATE OR REPLACE FUNCTION public.generate_settlement_report(
    p_event_id UUID,
    p_organizer_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payout_id UUID;
    v_event_data RECORD;
    v_stripe_sales INTEGER;
    v_stripe_fee INTEGER;
    v_application_fee INTEGER;
    v_net_amount INTEGER;
    v_refund_data JSON;
    v_payment_count INTEGER;
    v_transfer_group TEXT;
    v_today_start TIMESTAMP WITH TIME ZONE;
    v_today_end TIMESTAMP WITH TIME ZONE;
    v_existing_report_id UUID;
BEGIN
    -- バリデーション
    IF p_event_id IS NULL OR p_organizer_id IS NULL THEN
        RAISE EXCEPTION 'event_id and organizer_id are required';
    END IF;

    -- イベント情報と Stripe アカウント情報を取得
    SELECT
        e.id,
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

    -- イベントが見つからない場合
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found or organizer not authorized, or Stripe Connect account not ready';
    END IF;

    -- 今日の日付範囲を設定（JST基準）
    v_today_start := (now() AT TIME ZONE 'Asia/Tokyo')::date AT TIME ZONE 'Asia/Tokyo';
    v_today_end := v_today_start + INTERVAL '1 day';

    -- 今日既にレポートが存在するかチェック
    SELECT id INTO v_existing_report_id
    FROM public.payouts
    WHERE event_id = p_event_id
      AND settlement_mode = 'destination_charge'
      AND generated_at >= v_today_start
      AND generated_at < v_today_end
    LIMIT 1;

    -- 既存レポートがある場合はそのIDを返す
    IF v_existing_report_id IS NOT NULL THEN
        RETURN v_existing_report_id;
    END IF;

    -- Transfer Group生成
    v_transfer_group := 'event_' || p_event_id::text || '_payout';

    -- 売上集計（Stripe決済のみ）
    SELECT
        COALESCE(SUM(p.amount), 0)::INT,
        COUNT(*)::INT
    INTO
        v_stripe_sales,
        v_payment_count
    FROM public.payments p
    JOIN public.attendances a ON p.attendance_id = a.id
    WHERE a.event_id = p_event_id
      AND p.method = 'stripe'
      AND p.status = 'paid';

    -- Stripe手数料計算（既存関数を使用）
    v_stripe_fee := public.calc_total_stripe_fee(p_event_id);

    -- アプリケーション手数料計算
    v_application_fee := public.calc_total_application_fee(p_event_id);

    -- 返金・異議データ取得
    v_refund_data := public.calc_refund_dispute_summary(p_event_id);

    -- 手取り額計算
    v_net_amount := v_stripe_sales - v_stripe_fee - v_application_fee;

    -- payouts テーブルにレポートを保存（新規行でバージョン運用）
    INSERT INTO public.payouts (
        event_id,
        user_id,
        total_stripe_sales,
        total_stripe_fee,
        platform_fee,              -- destination charges では application_fee と同義
        net_payout_amount,
        stripe_account_id,
        transfer_group,
        settlement_mode,
        status,                    -- destination charges では常に 'completed'
        generated_at
    ) VALUES (
        p_event_id,
        p_organizer_id,
        v_stripe_sales,
        v_stripe_fee,
        v_application_fee,
        v_net_amount,
        v_event_data.stripe_account_id,
        v_transfer_group,
        'destination_charge',
        'completed',
        now()
    )
    RETURNING id INTO v_payout_id;

    RETURN v_payout_id;

EXCEPTION
    WHEN unique_violation THEN
        -- 一意制約違反の場合（同日重複）、既存IDを検索して返す
        SELECT id INTO v_existing_report_id
        FROM public.payouts
        WHERE event_id = p_event_id
          AND settlement_mode = 'destination_charge'
          AND generated_at >= v_today_start
          AND generated_at < v_today_end
        LIMIT 1;

        IF v_existing_report_id IS NOT NULL THEN
            RETURN v_existing_report_id;
        ELSE
            RAISE;
        END IF;
END;
$$;

COMMENT ON FUNCTION public.generate_settlement_report(UUID, UUID) IS 'イベント清算レポートを生成（destination charges用）。同日重複は既存IDを返す。';

-- 4. 清算レポート詳細取得関数
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

-- 5. RLSポリシーの更新（既存ポリシーがあれば適用）
-- settlement_mode='destination_charge' のレポートに対する閲覧権限を明示的に設定

-- イベント主催者は自分のイベントの清算レポートを閲覧可能
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'payouts'
        AND policyname = 'event_creators_can_view_settlement_reports'
    ) THEN
        CREATE POLICY "event_creators_can_view_settlement_reports" ON public.payouts
        FOR SELECT TO authenticated
        USING (
            settlement_mode = 'destination_charge' AND
            EXISTS (
                SELECT 1 FROM public.events e
                WHERE e.id = payouts.event_id
                AND e.created_by = auth.uid()
            )
        );
    END IF;
END $$;

-- 完了通知
DO $$ BEGIN
    RAISE NOTICE '✅ Settlement report functions created successfully for destination charges migration.';
END $$;
