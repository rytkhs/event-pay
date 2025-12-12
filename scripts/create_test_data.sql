-- ====================================================================================================
-- UIテスト用包括テストデータ作成スクリプト
-- ====================================================================================================
-- 特定のアカウントに紐付いた大量の多様なパターンのテストデータを作成します
--
-- 実行前の準備:
-- 1. テストユーザーのUUIDを確認・更新してください
-- 2. 本番環境では実行しないでください
-- ====================================================================================================

DO $$
DECLARE
    -- ⚠️ ここに実際のテストユーザーのUUIDを設定してください
    test_user_id UUID := '31f71701-0a42-4c79-a7f5-b98aac502e24'; -- PLACEHOLDER: 実際のUUIDに変更

    -- イベント用変数
    event_ids UUID[];
    event_id UUID;

    -- 参加者用変数
    attendance_id UUID;
    guest_token TEXT;

    -- 現在時刻
    now_time TIMESTAMP WITH TIME ZONE := NOW();

    -- カウンター
    i INTEGER;
    j INTEGER;
    k INTEGER;
BEGIN
    RAISE NOTICE 'テストデータ作成開始...';

    -- ====================================================================================================
    -- 1. テストユーザー設定
    -- ====================================================================================================

    -- auth.users に存在するユーザーIDか事前検証（FK制約のため必須）
    IF test_user_id IS NULL THEN
        RAISE EXCEPTION 'test_user_id が未設定です。実行前に実在する auth.users.id を設定してください。';
    END IF;

    PERFORM 1 FROM auth.users WHERE id = test_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'auth.users に対象ユーザー（%）が存在しません。先に Supabase 側でユーザーを作成し、UUID を設定してください。', test_user_id;
    END IF;

    -- public.usersテーブルにテストユーザーを追加（存在しない場合のみ）
    INSERT INTO public.users (id, name, created_at, updated_at)
    VALUES (
        test_user_id,
        'テストユーザー（UI確認用）',
        now_time - interval '30 days',
        now_time - interval '30 days'
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = EXCLUDED.updated_at;

    RAISE NOTICE 'テストユーザー設定完了: %', test_user_id;

    -- ====================================================================================================
    -- 2. Stripe Connectアカウント設定（複数パターン）
    -- ====================================================================================================

    -- Verified（認証済み）アカウント
    INSERT INTO public.stripe_connect_accounts (
        user_id,
        stripe_account_id,
        status,
        charges_enabled,
        payouts_enabled,
        created_at,
        updated_at
    ) VALUES (
        test_user_id,
        'acct_1SNbjmCtoNNhKnPZ',
        'verified',
        true,
        true,
        now_time - interval '25 days',
        now_time - interval '1 day'
    )
    ON CONFLICT (user_id) DO UPDATE SET
        stripe_account_id = EXCLUDED.stripe_account_id,
        status = EXCLUDED.status,
        charges_enabled = EXCLUDED.charges_enabled,
        payouts_enabled = EXCLUDED.payouts_enabled,
        updated_at = EXCLUDED.updated_at;

    RAISE NOTICE 'Stripe Connectアカウント設定完了';

    -- ====================================================================================================
    -- 3. 多様なパターンのイベント作成
    -- ====================================================================================================

    event_ids := ARRAY[]::UUID[];

    -- パターン1: 開催済み・有料・Stripeのみ・参加者多数
    INSERT INTO public.events (
        created_by, title, date, location, fee, capacity, description,
        registration_deadline, payment_deadline, payment_methods, invite_token,
        created_at, updated_at
    ) VALUES (
        test_user_id,
        '【終了済み】春の懇親会 2024',
        now_time - interval '20 days',
        '東京都渋谷区〇〇ビル',
        3500,
        50,
        '季節の懇親会です。美味しい料理とお酒をご用意しています！',
        now_time - interval '25 days',
        now_time - interval '22 days',
        ARRAY['stripe']::payment_method_enum[],
        'inv_' || substr(md5(random()::text), 1, 32),
        now_time - interval '30 days',
        now_time - interval '30 days'
    ) RETURNING id INTO event_id;
    event_ids := array_append(event_ids, event_id);

    -- パターン2: 開催済み・無料・現金のみ
    INSERT INTO public.events (
        created_by, title, date, location, fee, capacity, description,
        registration_deadline, payment_deadline, payment_methods, invite_token,
        created_at, updated_at
    ) VALUES (
        test_user_id,
        '【終了済み】無料勉強会：Next.js入門',
        now_time - interval '15 days',
        'オンライン（Zoom）',
        0,
        100,
        'Next.js 14の基本的な使い方を学ぶ勉強会です。初心者歓迎！',
        now_time - interval '18 days',
        NULL,
        ARRAY['cash']::payment_method_enum[],
        'inv_' || substr(md5(random()::text), 1, 32),
        now_time - interval '20 days',
        now_time - interval '20 days'
    ) RETURNING id INTO event_id;
    event_ids := array_append(event_ids, event_id);

    -- パターン3: 開催済み・中止イベント
    INSERT INTO public.events (
        created_by, title, date, location, fee, capacity, description,
        registration_deadline, payment_deadline, payment_methods, invite_token,
        created_at, updated_at, canceled_at, canceled_by
    ) VALUES (
        test_user_id,
        '【中止】夏祭りイベント',
        now_time - interval '10 days',
        '都立〇〇公園',
        2000,
        200,
        '申し訳ございませんが、天候の都合により中止となりました。',
        now_time - interval '15 days',
        now_time - interval '12 days',
        ARRAY['stripe', 'cash']::payment_method_enum[],
        'inv_' || substr(md5(random()::text), 1, 32),
        now_time - interval '25 days',
        now_time - interval '13 days',
        now_time - interval '13 days',
        test_user_id
    ) RETURNING id INTO event_id;
    event_ids := array_append(event_ids, event_id);

    -- パターン4: 開催予定・高額・Stripe+現金
    INSERT INTO public.events (
        created_by, title, date, location, fee, capacity, description,
        registration_deadline, payment_deadline, payment_methods, invite_token,
        created_at, updated_at
    ) VALUES (
        test_user_id,
        '【予定】年末パーティー2024',
        now_time + interval '45 days',
        'ホテル〇〇 宴会場',
        8000,
        80,
        '豪華な年末パーティーです！ドレスコードあり。',
        now_time + interval '30 days',
        now_time + interval '35 days',
        ARRAY['stripe', 'cash']::payment_method_enum[],
        'inv_' || substr(md5(random()::text), 1, 32),
        now_time - interval '5 days',
        now_time - interval '5 days'
    ) RETURNING id INTO event_id;
    event_ids := array_append(event_ids, event_id);

    -- パターン5: 開催予定・無料・定員少
    INSERT INTO public.events (
        created_by, title, date, location, fee, capacity, description,
        registration_deadline, payment_deadline, payment_methods, invite_token,
        created_at, updated_at
    ) VALUES (
        test_user_id,
        '【予定】少人数読書会',
        now_time + interval '14 days',
        'カフェ〇〇',
        0,
        30,
        '今月の課題図書について語り合いましょう。',
        now_time + interval '10 days',
        NULL,
        ARRAY['cash']::payment_method_enum[],
        'inv_' || substr(md5(random()::text), 1, 32),
        now_time - interval '3 days',
        now_time - interval '3 days'
    ) RETURNING id INTO event_id;
    event_ids := array_append(event_ids, event_id);

    -- パターン6: 開催予定・締切間近
    INSERT INTO public.events (
        created_by, title, date, location, fee, capacity, description,
        registration_deadline, payment_deadline, payment_methods, invite_token,
        created_at, updated_at
    ) VALUES (
        test_user_id,
        '【締切間近】ワークショップ：React応用',
        now_time + interval '7 days',
        '〇〇コワーキングスペース',
        4500,
        20,
        'React の応用的な内容を実践形式で学びます。',
        now_time + interval '2 days',
        now_time + interval '4 days',
        ARRAY['stripe']::payment_method_enum[],
        'inv_' || substr(md5(random()::text), 1, 32),
        now_time - interval '7 days',
        now_time - interval '7 days'
    ) RETURNING id INTO event_id;
    event_ids := array_append(event_ids, event_id);

    -- パターン7: 開催予定・定員なし・高額
    INSERT INTO public.events (
        created_by, title, date, location, fee, capacity, description,
        registration_deadline, payment_deadline, payment_methods, invite_token,
        created_at, updated_at
    ) VALUES (
        test_user_id,
        '【予定】オンライン技術カンファレンス',
        now_time + interval '25 days',
        'オンライン配信',
        12000,
        NULL, -- 定員なし
        '業界のエキスパートが最新技術動向を紹介します。',
        now_time + interval '20 days',
        now_time + interval '22 days',
        ARRAY['stripe']::payment_method_enum[],
        'inv_' || substr(md5(random()::text), 1, 32),
        now_time - interval '2 days',
        now_time - interval '2 days'
    ) RETURNING id INTO event_id;
    event_ids := array_append(event_ids, event_id);

    -- パターン8: 開催予定・定員250人・参加者200人・中額
    INSERT INTO public.events (
        created_by, title, date, location, fee, capacity, description,
        registration_deadline, payment_deadline, payment_methods, invite_token,
        created_at, updated_at
    ) VALUES (
        test_user_id,
        '【予定】大規模セミナー：AI時代のビジネス戦略',
        now_time + interval '20 days',
        '東京国際フォーラム ホールA',
        5500,
        250,
        'AI技術の最新動向とビジネスへの応用について、専門家が詳しく解説します。',
        now_time + interval '15 days',
        now_time + interval '18 days',
        ARRAY['stripe', 'cash']::payment_method_enum[],
        'inv_' || substr(md5(random()::text), 1, 32),
        now_time - interval '5 days',
        now_time - interval '5 days'
    ) RETURNING id INTO event_id;
    event_ids := array_append(event_ids, event_id);

    RAISE NOTICE 'イベント作成完了: % 件', array_length(event_ids, 1);

    -- ====================================================================================================
    -- 4. 各イベントに参加者データを追加
    -- ====================================================================================================

    -- 参加者名パターン
    FOR i IN 1..array_length(event_ids, 1) LOOP
        event_id := event_ids[i];

        -- 各イベントに参加者を追加（パターン8は200人、その他は10-30名）
        FOR j IN 1..CASE
            WHEN i = 8 THEN 200  -- パターン8: 定員250人で参加者200人
            ELSE (15 + (i * 3))  -- その他のイベント: 10-30名
        END LOOP
            -- ゲストトークン生成
            guest_token := 'gst_' || substr(md5(random()::text), 1, 32);

            -- 参加状況をランダムに決定
            INSERT INTO public.attendances (
                event_id,
                nickname,
                email,
                status,
                guest_token,
                created_at,
                updated_at
            ) VALUES (
                event_id,
                CASE (j % 10)
                    WHEN 0 THEN '田中太郎'
                    WHEN 1 THEN '佐藤花子'
                    WHEN 2 THEN '鈴木一郎'
                    WHEN 3 THEN '高橋美咲'
                    WHEN 4 THEN 'Smith John'
                    WHEN 5 THEN '山田次郎'
                    WHEN 6 THEN '渡辺麻衣'
                    WHEN 7 THEN '伊藤健太'
                    WHEN 8 THEN '中村ゆり'
                    ELSE '松本達也'
                END || '_' || j::text,
                'test' || i::text || '_' || j::text || '@example.com',
                CASE (j % 4)
                    WHEN 0 THEN 'attending'
                    WHEN 1 THEN 'not_attending'
                    WHEN 2 THEN 'maybe'
                    ELSE 'attending'
                END::attendance_status_enum,
                guest_token,
                now_time - interval '15 days' + (random() * interval '10 days'),
                now_time - interval '5 days' + (random() * interval '3 days')
            ) RETURNING id INTO attendance_id;

            -- ====================================================================================================
            -- ▼▼▼ 変更箇所 (2025-12-12 Updated) ▼▼▼
            -- 新仕様に基づき、決済方法・ステータスの整合性を確保
            -- 1. イベントで許可された決済方法のみを使用
            -- 2. Stripe: pending, paid, refunded, failed, canceled (waived, received不可)
            -- 3. Cash: pending, received, waived, canceled (paid, refunded, failed不可)
            -- ====================================================================================================
            DECLARE
                event_fee INTEGER;
                allowed_methods public.payment_method_enum[];
                payment_method public.payment_method_enum;
                payment_status public.payment_status_enum;
            BEGIN
                -- イベント情報（参加費・許可された決済方法）を取得
                SELECT fee, payment_methods INTO event_fee, allowed_methods
                FROM public.events WHERE id = event_id;

                -- 有料イベント かつ 参加(attending) の場合のみ決済レコードを作成
                -- j % 4 IN (0, 3) は、attendances insert時の case と一致させている
                IF event_fee > 0 AND (j % 4) IN (0, 3) THEN

                    -- 決済方法を決定 (イベントの許可する方法からランダムに選択)
                    IF allowed_methods IS NOT NULL AND array_length(allowed_methods, 1) > 0 THEN
                         -- jを使ってある程度分散させる
                        payment_method := allowed_methods[1 + (j % array_length(allowed_methods, 1))];
                    ELSE
                        -- フォールバック（通常ここは通らないはず）
                        payment_method := 'cash';
                    END IF;

                    -- 決済ステータスを決定（仕様書準拠）
                    IF payment_method = 'stripe' THEN
                        -- Stripe: pending (10), failed (15), paid (20), canceled (35), refunded (40)
                        -- ※ waived, received は不可
                        payment_status := CASE (j % 8)
                            WHEN 0 THEN 'paid'
                            WHEN 1 THEN 'paid'
                            WHEN 2 THEN 'pending'
                            WHEN 3 THEN 'failed'
                            WHEN 4 THEN 'canceled'
                            WHEN 5 THEN 'refunded' -- paidからの返金
                            WHEN 6 THEN 'paid'
                            ELSE 'pending'
                        END;
                    ELSE -- 'cash'
                        -- Cash: pending (10), received (20), waived (25), canceled (35)
                        -- ※ paid, refunded, failed は不可
                        payment_status := CASE (j % 6)
                            WHEN 0 THEN 'received'
                            WHEN 1 THEN 'received'
                            WHEN 2 THEN 'pending'
                            WHEN 3 THEN 'waived'   -- 管理者免除
                            WHEN 4 THEN 'canceled'
                            ELSE 'pending'
                        END;
                    END IF;

                    -- 決済データを作成
                    INSERT INTO public.payments (
                        attendance_id,
                        method,
                        amount,
                        status,
                        stripe_payment_intent_id,
                        stripe_charge_id,
                        paid_at,
                        created_at,
                        updated_at
                    ) VALUES (
                        attendance_id,
                        payment_method,
                        event_fee,
                        payment_status,
                        -- Stripe決済の場合のみID設定
                        CASE WHEN payment_method = 'stripe' THEN 'pi_test_' || substr(md5(random()::text), 1, 24) ELSE NULL END,
                        CASE WHEN payment_method = 'stripe' THEN 'ch_test_' || substr(md5(random()::text), 1, 24) ELSE NULL END,
                        -- paid_at設定: paid, received, refunded (refundedも元は支払い完了している)
                        CASE WHEN payment_status IN ('paid', 'received', 'refunded') THEN
                            now_time - interval '10 days' + (random() * interval '8 days')
                            ELSE NULL
                        END,
                        now_time - interval '12 days' + (random() * interval '8 days'),
                        now_time - interval '8 days' + (random() * interval '5 days')
                    );
                END IF;
            END;
            -- ====================================================================================================
            -- ▲▲▲ 変更箇所 ▲▲▲
            -- ====================================================================================================
        END LOOP;

        RAISE NOTICE 'イベント % の参加者データ作成完了', i;
    END LOOP;

    -- ====================================================================================================
    -- 5. 清算データ（settlements）の追加
    -- ====================================================================================================

    -- SECURITY DEFINER 関数 generate_settlement_report は JWT クレーム（sub）を要求するため、
    -- 実行ロール（postgres）でも一時的にクレームを設定して呼び出す
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', test_user_id::text), true);

    -- 開催済みイベントに清算データを追加
    FOR i IN 1..3 LOOP  -- 最初の3つのイベント（開催済み）
        event_id := event_ids[i];

        -- 清算レポート生成
        PERFORM public.generate_settlement_report(event_id, test_user_id);

        RAISE NOTICE '清算データ作成完了: イベント %', i;
    END LOOP;

    -- ====================================================================================================
    -- 完了メッセージ
    -- ====================================================================================================

    RAISE NOTICE '====================================================================================================';
    RAISE NOTICE 'テストデータ作成が完了しました！';
    RAISE NOTICE '====================================================================================================';
    RAISE NOTICE 'テストユーザーID: %', test_user_id;
    RAISE NOTICE '作成されたイベント数: %', array_length(event_ids, 1);
    RAISE NOTICE '参加者総数: %', (SELECT COUNT(*) FROM public.attendances a WHERE a.event_id = ANY(event_ids));
    RAISE NOTICE '決済レコード数: %', (SELECT COUNT(*) FROM public.payments p
                                                        JOIN public.attendances a ON p.attendance_id = a.id
                                                        WHERE a.event_id = ANY(event_ids));
    RAISE NOTICE '====================================================================================================';
    RAISE NOTICE 'UIテストを開始してください！';
    RAISE NOTICE '====================================================================================================';

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'エラーが発生しました: %', SQLERRM;
        RAISE;
END $$;
