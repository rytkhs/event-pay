-- EventPay シードデータ作成マイグレーション
-- DB-005: シードデータ作成
-- 作成日: 2025-06-25

-- ====================================================================
-- 開発環境用シードデータ作成
-- ====================================================================

-- 開発環境でのみシードデータを作成
DO $$
DECLARE
    current_env TEXT;
    test_user_id UUID;
    test_event_id UUID;
    test_attendance_id UUID;
BEGIN
    -- 環境設定の確認
    current_env := current_setting('app.environment', true);

    -- 本番環境ではシードデータを作成しない
    IF current_env = 'production' THEN
        RAISE NOTICE 'シードデータの作成をスキップしました（本番環境）';
        RETURN;
    END IF;

    RAISE NOTICE 'シードデータの作成を開始します（環境: %）', COALESCE(current_env, 'development');

    -- ====================================================================
    -- テスト用ユーザーデータ
    -- ====================================================================

    -- テスト用のauth.usersレコードのIDを使用（存在しない場合は新規作成）
    test_user_id := '550e8400-e29b-41d4-a716-446655440000';

    -- auth.usersテーブルにテストユーザーが存在しない場合は作成
    -- 注意: 実際の環境では、Supabase Authを通じてユーザーを作成する必要があります
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = test_user_id) THEN
        -- 開発環境用のダミーユーザーをauth.usersに挿入
        -- 実際のプロダクションではSupabase Authを使用
        INSERT INTO auth.users (
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            created_at,
            updated_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            test_user_id,
            'authenticated',
            'authenticated',
            'test-organizer@eventpay.example.com',
            '$2a$10$X9VzP6lVP5Q4.F7zX8CYfOnBFPNjT8YwfLnvQtKlWVxfEiLQn/8u6', -- テスト用ハッシュ
            NOW(),
            NOW(),
            NOW(),
            '{"provider": "email", "providers": ["email"]}',
            '{}',
            false,
            '',
            '',
            '',
            ''
        );

        RAISE NOTICE 'テスト用auth.usersレコードを作成しました: %', test_user_id;
    END IF;

    -- usersテーブルにテストデータを挿入
    INSERT INTO public.users (
        id,
        email,
        name
    ) VALUES (
        test_user_id,
        'test-organizer@eventpay.example.com',
        'テスト運営者'
    ) ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        updated_at = NOW();

    RAISE NOTICE 'テスト用ユーザーデータを作成しました';

    -- ====================================================================
    -- サンプルイベントデータ
    -- ====================================================================

    -- 無料イベントのサンプル（created_atを明示的に過去に設定）
    INSERT INTO public.events (
        id,
        created_by,
        title,
        date,
        location,
        fee,
        capacity,
        description,
        registration_deadline,
        payment_deadline,
        payment_methods,
        invite_token,
        status,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        test_user_id,
        '【無料】EventPay勉強会 〜決済システムの仕組みを学ぼう〜',
        NOW() + INTERVAL '7 days',
        '東京都渋谷区 EventPayオフィス',
        0,
        20,
        'EventPayの仕組みや決済システムについて学ぶ勉強会です。初心者歓迎！軽食もご用意いたします。',
        NOW() + INTERVAL '5 days',
        NULL,
        ARRAY['free']::payment_method_enum[],
        'free-study-session-2025',
        'upcoming',
        NOW() - INTERVAL '1 hour',  -- created_atを1時間前に設定
        NOW() - INTERVAL '1 hour'
    )
    RETURNING id INTO test_event_id;

    -- 有料イベントのサンプル
    INSERT INTO public.events (
        created_by,
        title,
        date,
        location,
        fee,
        capacity,
        description,
        registration_deadline,
        payment_deadline,
        payment_methods,
        invite_token,
        status,
        created_at,
        updated_at
    ) VALUES (
        test_user_id,
        'EventPay新年会 2025 🎉',
        NOW() + INTERVAL '14 days',
        '東京都新宿区 某居酒屋',
        3500,
        15,
        '2025年の新年会を開催します！美味しい料理とお酒で、今年もよろしくお願いします。',
        NOW() + INTERVAL '10 days',
        NOW() + INTERVAL '12 days',
        ARRAY['stripe', 'cash']::payment_method_enum[],
        'eventpay-new-year-party-2025',
        'upcoming',
        NOW() - INTERVAL '2 hours',  -- created_atを2時間前に設定
        NOW() - INTERVAL '2 hours'
    );

    -- 過去イベントのサンプル（送金テスト用）
    INSERT INTO public.events (
        created_by,
        title,
        date,
        location,
        fee,
        capacity,
        description,
        payment_methods,
        invite_token,
        status,
        created_at,
        updated_at
    ) VALUES (
        test_user_id,
        'EventPay忘年会 2024（完了済み）',
        NOW() - INTERVAL '30 days',
        '東京都港区 某レストラン',
        4000,
        12,
        '2024年の忘年会。おかげさまで大成功でした！',
        ARRAY['stripe', 'cash']::payment_method_enum[],
        'eventpay-year-end-party-2024',
        'past',
        NOW() - INTERVAL '35 days',  -- created_atを35日前に設定
        NOW() - INTERVAL '35 days'
    );

    RAISE NOTICE 'サンプルイベントデータを作成しました';

    -- ====================================================================
    -- 参加者・決済データのサンプル（無料イベント用）
    -- ====================================================================

    -- 無料イベントの参加者
    INSERT INTO public.attendances (
        id,
        event_id,
        nickname,
        email,
        status
    ) VALUES (
        gen_random_uuid(),
        test_event_id,
        'テスト参加者A',
        'participant-a@example.com',
        'attending'
    )
    RETURNING id INTO test_attendance_id;

    -- 無料イベントの決済レコード
    INSERT INTO public.payments (
        attendance_id,
        method,
        amount,
        status,
        paid_at
    ) VALUES (
        test_attendance_id,
        'free',
        0,
        'completed',
        NOW()
    );

    -- 追加の参加者（未定ステータス）
    INSERT INTO public.attendances (
        event_id,
        nickname,
        status
    ) VALUES (
        test_event_id,
        'テスト参加者B（未定）',
        'maybe'
    );
    -- 未定の場合は決済レコードを作成しない

    -- 不参加者のサンプル
    INSERT INTO public.attendances (
        event_id,
        nickname,
        email,
        status
    ) VALUES (
        test_event_id,
        'テスト参加者C（不参加）',
        'participant-c@example.com',
        'not_attending'
    );
    -- 不参加の場合も決済レコードを作成しない

    RAISE NOTICE '参加者・決済データのサンプルを作成しました';

    -- ====================================================================
    -- Stripe Connect アカウントサンプル（テスト用）
    -- ====================================================================

    -- テスト用のStripe Connectアカウント
    INSERT INTO public.stripe_connect_accounts (
        user_id,
        stripe_account_id,
        status,
        charges_enabled,
        payouts_enabled
    ) VALUES (
        test_user_id,
        'acct_test1234567890abcdef',  -- テスト用アカウントID
        'verified',
        true,
        true
    ) ON CONFLICT (user_id) DO UPDATE SET
        stripe_account_id = EXCLUDED.stripe_account_id,
        status = EXCLUDED.status,
        charges_enabled = EXCLUDED.charges_enabled,
        payouts_enabled = EXCLUDED.payouts_enabled,
        updated_at = NOW();

    RAISE NOTICE 'Stripe Connectアカウントサンプルを作成しました';

    -- ====================================================================
    -- 送金履歴サンプル（過去イベント用）
    -- ====================================================================

    -- 過去イベントの送金履歴サンプル
    INSERT INTO public.payouts (
        event_id,
        user_id,
        total_stripe_sales,
        total_stripe_fee,
        platform_fee,
        net_payout_amount,
        status,
        stripe_transfer_id,
        processed_at,
        notes
    ) VALUES (
        (SELECT id FROM public.events WHERE invite_token = 'eventpay-year-end-party-2024'),
        test_user_id,
        48000,  -- 4000円 × 12人分
        1728,   -- Stripe手数料 3.6%
        0,      -- プラットフォーム手数料（MVP期間中は0%）
        46272,  -- 実際の送金額
        'completed',
        'tr_test1234567890abcdef',
        NOW() - INTERVAL '25 days',
        '2024年忘年会の送金完了'
    );

    RAISE NOTICE '送金履歴サンプルを作成しました';

    -- ====================================================================
    -- シードデータ作成完了の報告
    -- ====================================================================

    RAISE NOTICE '✅ DB-005: シードデータ作成が完了しました';
    RAISE NOTICE '作成されたデータ:';
    RAISE NOTICE '- テスト用ユーザー: 1名';
    RAISE NOTICE '- サンプルイベント: 3件（無料・有料・過去）';
    RAISE NOTICE '- 参加者データ: 3件（参加・未定・不参加）';
    RAISE NOTICE '- 決済データ: 1件（無料）';
    RAISE NOTICE '- Stripe Connectアカウント: 1件';
    RAISE NOTICE '- 送金履歴: 1件';

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'シードデータ作成中にエラーが発生しました: %', SQLERRM;
        RAISE WARNING 'SQLSTATE: %', SQLSTATE;
        -- エラーが発生してもマイグレーション自体は継続
END $$;

-- ====================================================================
-- シードデータ検証関数の作成（開発・テスト環境専用）
-- ====================================================================

-- シードデータの状況を確認する関数
CREATE OR REPLACE FUNCTION public.verify_seed_data()
RETURNS TABLE(
    table_name TEXT,
    record_count BIGINT,
    status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        'users'::TEXT as table_name,
        COUNT(*)::BIGINT as record_count,
        CASE WHEN COUNT(*) > 0 THEN 'データあり' ELSE 'データなし' END::TEXT as status
    FROM public.users

    UNION ALL

    SELECT
        'events'::TEXT,
        COUNT(*)::BIGINT,
        CASE WHEN COUNT(*) > 0 THEN 'データあり' ELSE 'データなし' END::TEXT
    FROM public.events

    UNION ALL

    SELECT
        'attendances'::TEXT,
        COUNT(*)::BIGINT,
        CASE WHEN COUNT(*) > 0 THEN 'データあり' ELSE 'データなし' END::TEXT
    FROM public.attendances

    UNION ALL

    SELECT
        'payments'::TEXT,
        COUNT(*)::BIGINT,
        CASE WHEN COUNT(*) > 0 THEN 'データあり' ELSE 'データなし' END::TEXT
    FROM public.payments

    UNION ALL

    SELECT
        'stripe_connect_accounts'::TEXT,
        COUNT(*)::BIGINT,
        CASE WHEN COUNT(*) > 0 THEN 'データあり' ELSE 'データなし' END::TEXT
    FROM public.stripe_connect_accounts

    UNION ALL

    SELECT
        'payouts'::TEXT,
        COUNT(*)::BIGINT,
        CASE WHEN COUNT(*) > 0 THEN 'データあり' ELSE 'データなし' END::TEXT
    FROM public.payouts;
END;
$$;

-- 関数の実行権限設定
GRANT EXECUTE ON FUNCTION public.verify_seed_data() TO authenticated, service_role;

-- シードデータ検証の実行
DO $$
DECLARE
    verification_results RECORD;
BEGIN
    RAISE NOTICE 'シードデータ検証結果:';

    FOR verification_results IN
        SELECT * FROM public.verify_seed_data()
    LOOP
        RAISE NOTICE '- %: %件 (%)',
            verification_results.table_name,
            verification_results.record_count,
            verification_results.status;
    END LOOP;
END $$;
