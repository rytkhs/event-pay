-- ====================================================================
-- EventPay: 監査ログ付き決済ステータス更新RPC関数
-- 目的: トランザクション整合性を保証した決済ステータス更新と監査ログ記録
-- ====================================================================

BEGIN;

-- ====================================================================
-- 単体決済ステータス更新（監査ログ付き）
-- ====================================================================

CREATE OR REPLACE FUNCTION public.update_payment_status_with_audit(
    p_payment_id UUID,
    p_new_status public.payment_status_enum,
    p_paid_at TIMESTAMPTZ DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_stripe_payment_intent_id TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_status public.payment_status_enum;
    v_payment_method public.payment_method_enum;
    v_attendance_id UUID;
    v_event_id UUID;
    v_updated_rows INTEGER;
    v_result JSON;
BEGIN
    -- 入力値検証
    IF p_payment_id IS NULL THEN
        RAISE EXCEPTION 'payment_id cannot be null';
    END IF;

    IF p_new_status IS NULL THEN
        RAISE EXCEPTION 'new_status cannot be null';
    END IF;

    -- 既存の決済レコード取得と権限チェック用データ取得
    SELECT
        p.status,
        p.method,
        p.attendance_id,
        a.event_id
    INTO
        v_old_status,
        v_payment_method,
        v_attendance_id,
        v_event_id
    FROM public.payments p
    INNER JOIN public.attendances a ON p.attendance_id = a.id
    WHERE p.id = p_payment_id;

    -- 決済レコードの存在確認
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment record not found: %', p_payment_id;
    END IF;

    -- 現金決済のみ手動更新可能（Stripe決済はWebhook経由のみ）
    IF v_payment_method = 'stripe' AND p_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'Stripe payments can only be updated via webhooks';
    END IF;

    -- ステータス遷移の妥当性チェック
    -- received/waived は pending/failed からのみ可能
    IF p_new_status IN ('received', 'waived') THEN
        IF v_old_status NOT IN ('pending', 'failed') THEN
            RAISE EXCEPTION 'Invalid status transition from % to %', v_old_status, p_new_status;
        END IF;
    END IF;

    -- 決済ステータス更新
    UPDATE public.payments
    SET
        status = p_new_status,
        paid_at = CASE
            WHEN p_new_status IN ('paid', 'received', 'completed') AND p_paid_at IS NOT NULL
            THEN p_paid_at
            WHEN p_new_status IN ('paid', 'received', 'completed') AND p_paid_at IS NULL
            THEN NOW()
            ELSE paid_at
        END,
        stripe_payment_intent_id = COALESCE(p_stripe_payment_intent_id, stripe_payment_intent_id)
    WHERE id = p_payment_id;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

    IF v_updated_rows = 0 THEN
        RAISE EXCEPTION 'Failed to update payment status for payment_id: %', p_payment_id;
    END IF;

    -- 監査ログ記録
    INSERT INTO public.system_logs (
        operation_type,
        details,
        created_at
    ) VALUES (
        'payment_status_update',
        json_build_object(
            'payment_id', p_payment_id,
            'attendance_id', v_attendance_id,
            'event_id', v_event_id,
            'old_status', v_old_status,
            'new_status', p_new_status,
            'payment_method', v_payment_method,
            'user_id', p_user_id,
            'notes', p_notes,
            'stripe_payment_intent_id', p_stripe_payment_intent_id,
            'updated_at', NOW()
        ),
        NOW()
    );

    -- 結果返却
    v_result := json_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'old_status', v_old_status,
        'new_status', p_new_status,
        'updated_at', NOW()
    );

    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        -- エラーログ記録（可能な限り）
        BEGIN
            INSERT INTO public.system_logs (
                operation_type,
                details,
                created_at
            ) VALUES (
                'payment_status_update_error',
                json_build_object(
                    'payment_id', p_payment_id,
                    'new_status', p_new_status,
                    'user_id', p_user_id,
                    'error_message', SQLERRM,
                    'error_state', SQLSTATE
                ),
                NOW()
            );
        EXCEPTION
            WHEN OTHERS THEN
                NULL; -- ログ記録失敗は無視
        END;

        -- 元のエラーを再発生
        RAISE;
END;
$$;

COMMENT ON FUNCTION public.update_payment_status_with_audit IS '決済ステータスを更新し、監査ログを記録する。トランザクション整合性を保証。';

-- ====================================================================
-- 一括決済ステータス更新（監査ログ付き）
-- ====================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_payment_status_with_audit(
    p_payment_ids UUID[],
    p_new_status public.payment_status_enum,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment_id UUID;
    v_success_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_failures JSON[] := '{}';
    v_single_result JSON;
    v_error_message TEXT;
    v_result JSON;
BEGIN
    -- 入力値検証
    IF p_payment_ids IS NULL OR array_length(p_payment_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'payment_ids cannot be null or empty';
    END IF;

    IF array_length(p_payment_ids, 1) > 50 THEN
        RAISE EXCEPTION 'Cannot update more than 50 payments at once, got: %', array_length(p_payment_ids, 1);
    END IF;

    IF p_new_status IS NULL THEN
        RAISE EXCEPTION 'new_status cannot be null';
    END IF;

    -- 各決済を順次処理（個別エラーハンドリング）
    FOREACH v_payment_id IN ARRAY p_payment_ids
    LOOP
        BEGIN
            -- 単体更新関数を呼び出し
            SELECT public.update_payment_status_with_audit(
                v_payment_id,
                p_new_status,
                NULL, -- paid_at は受領時に自動設定
                p_notes,
                p_user_id,
                NULL  -- stripe_payment_intent_id
            ) INTO v_single_result;

            v_success_count := v_success_count + 1;

        EXCEPTION
            WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
                v_error_message := SQLERRM;

                -- 失敗情報を配列に追加
                v_failures := v_failures || json_build_object(
                    'payment_id', v_payment_id,
                    'error', v_error_message
                );
        END;
    END LOOP;

    -- 一括操作の監査ログ記録
    INSERT INTO public.system_logs (
        operation_type,
        details,
        created_at
    ) VALUES (
        'payment_bulk_status_update',
        json_build_object(
            'payment_ids', p_payment_ids,
            'new_status', p_new_status,
            'user_id', p_user_id,
            'notes', p_notes,
            'success_count', v_success_count,
            'failed_count', v_failed_count,
            'failures', v_failures,
            'total_count', array_length(p_payment_ids, 1)
        ),
        NOW()
    );

    -- 結果返却
    v_result := json_build_object(
        'success', true,
        'success_count', v_success_count,
        'failed_count', v_failed_count,
        'total_count', array_length(p_payment_ids, 1),
        'failures', v_failures
    );

    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        -- 全体エラーログ記録
        BEGIN
            INSERT INTO public.system_logs (
                operation_type,
                details,
                created_at
            ) VALUES (
                'payment_bulk_status_update_error',
                json_build_object(
                    'payment_ids', p_payment_ids,
                    'new_status', p_new_status,
                    'user_id', p_user_id,
                    'error_message', SQLERRM,
                    'error_state', SQLSTATE
                ),
                NOW()
            );
        EXCEPTION
            WHEN OTHERS THEN
                NULL; -- ログ記録失敗は無視
        END;

        -- 元のエラーを再発生
        RAISE;
END;
$$;

COMMENT ON FUNCTION public.bulk_update_payment_status_with_audit IS '複数の決済ステータスを一括更新し、監査ログを記録する。部分成功・失敗に対応。';

-- ====================================================================
-- 関数の権限設定
-- ====================================================================

-- 認証済みユーザーのみ実行可能
-- 一般ユーザー (authenticated) からの実行権限は付与しない
REVOKE ALL ON FUNCTION public.update_payment_status_with_audit FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_payment_status_with_audit FROM authenticated;

REVOKE ALL ON FUNCTION public.bulk_update_payment_status_with_audit FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_update_payment_status_with_audit FROM authenticated;

-- Service roleは全権限（Webhook処理用）
GRANT EXECUTE ON FUNCTION public.update_payment_status_with_audit TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_update_payment_status_with_audit TO service_role;

COMMIT;
