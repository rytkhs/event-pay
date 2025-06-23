-- =======================
-- EventPay 開発用シードデータ
-- =======================

-- テストユーザーの作成（auth.usersテーブルは手動で作成する必要があります）
-- 注意: auth.usersへの直接INSERT はできないため、Supabase管理画面で以下のユーザーを手動作成してください
-- メール: test@example.com, パスワード: password123
-- メール: organizer@example.com, パスワード: password123

-- 手動作成後、以下のUUIDを実際のauth.user.idに置き換えてください
-- テストユーザーID（実際のauth.user.idに要置換）
INSERT INTO public.users (id, email, name) VALUES
('01234567-89ab-cdef-0123-456789abcdef', 'test@example.com', 'テストユーザー'),
('11111111-2222-3333-4444-555555555555', 'organizer@example.com', '主催者テスト')
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name;

-- サンプルイベントの作成
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
    status
) VALUES
(
    'event-1111-2222-3333-444444444444',
    '01234567-89ab-cdef-0123-456789abcdef',
    '新年会2024',
    '2024-01-15 18:00:00+09',
    '渋谷居酒屋「さくら」',
    3000,
    20,
    '今年もよろしくお願いします！新年会を開催します。美味しい料理とお酒で楽しみましょう。',
    '2024-01-14 23:59:59+09',
    '2024-01-14 23:59:59+09',
    ARRAY['stripe', 'cash'],
    'invite-token-shinnenkai-2024',
    'upcoming'
),
(
    'event-2222-3333-4444-555555555555',
    '01234567-89ab-cdef-0123-456789abcdef',
    'プログラミング勉強会 #5',
    '2024-01-20 19:00:00+09',
    'オンライン（Zoom）',
    500,
    30,
    'React/Next.jsの最新機能について学びます。初心者も歓迎！',
    '2024-01-19 23:59:59+09',
    '2024-01-19 23:59:59+09',
    ARRAY['stripe'],
    'invite-token-programming-study-5',
    'upcoming'
),
(
    'event-3333-4444-5555-666666666666',
    '11111111-2222-3333-4444-555555555555',
    '無料読書会',
    '2024-01-25 14:00:00+09',
    'カフェ・ブックス（新宿）',
    0,
    15,
    '今月のテーマ本について語り合いましょう。飲み物代は各自負担です。',
    '2024-01-24 23:59:59+09',
    NULL,
    ARRAY['free'],
    'invite-token-book-club-jan',
    'upcoming'
);

-- サンプル参加者データ
INSERT INTO public.attendances (
    id,
    event_id,
    nickname,
    email,
    status,
    guest_token
) VALUES
('attend-1111-2222-3333-444444444444', 'event-1111-2222-3333-444444444444', '山田太郎', 'yamada@example.com', 'attending', 'guest-token-yamada-001'),
('attend-2222-3333-4444-555555555555', 'event-1111-2222-3333-444444444444', '佐藤花子', 'sato@example.com', 'attending', 'guest-token-sato-002'),
('attend-3333-4444-5555-666666666666', 'event-1111-2222-3333-444444444444', '田中次郎', NULL, 'maybe', 'guest-token-tanaka-003'),
('attend-4444-5555-6666-777777777777', 'event-2222-3333-4444-555555555555', 'エンジニア太郎', 'engineer@example.com', 'attending', 'guest-token-engineer-004'),
('attend-5555-6666-7777-888888888888', 'event-3333-4444-5555-666666666666', '読書好き', NULL, 'attending', 'guest-token-reader-005');

-- サンプル決済データ
INSERT INTO public.payments (
    id,
    attendance_id,
    method,
    amount,
    status,
    stripe_payment_intent_id,
    paid_at
) VALUES
('payment-1111-2222-3333-444444444444', 'attend-1111-2222-3333-444444444444', 'stripe', 3000, 'paid', 'pi_test_1234567890', '2024-01-10 15:30:00+09'),
('payment-2222-3333-4444-555555555555', 'attend-2222-3333-4444-555555555555', 'cash', 3000, 'pending', NULL, NULL),
('payment-3333-4444-5555-666666666666', 'attend-3333-4444-5555-666666666666', 'cash', 3000, 'pending', NULL, NULL),
('payment-4444-5555-6666-777777777777', 'attend-4444-5555-6666-777777777777', 'stripe', 500, 'paid', 'pi_test_0987654321', '2024-01-12 20:15:00+09'),
('payment-5555-6666-7777-888888888888', 'attend-5555-6666-7777-888888888888', 'free', 0, 'completed', NULL, '2024-01-08 14:45:00+09');

-- サンプルStripe Connect アカウント
INSERT INTO public.stripe_connect_accounts (
    user_id,
    stripe_account_id,
    status,
    charges_enabled,
    payouts_enabled
) VALUES
('01234567-89ab-cdef-0123-456789abcdef', 'acct_test_1234567890', 'verified', true, true);

-- サンプル送金履歴（Stripe決済のみ対象）
-- 新年会（id: event-1111-2222-3333-444444444444）: Stripe決済 3,000円 + 500円 = 3,500円の売上
-- プラットフォーム手数料: MVP段階のため0%
INSERT INTO public.payouts (
    id,
    event_id,
    user_id,
    total_stripe_sales,
    total_stripe_fee,
    platform_fee,
    net_payout_amount,
    status,
    stripe_transfer_id,
    processed_at
) VALUES
(
    'payout-1111-2222-3333-444444444444',
    'event-1111-2222-3333-444444444444',
    '01234567-89ab-cdef-0123-456789abcdef',
    3500,  -- Stripe決済の売上総額（田中太郎 3,000円 + 佐藤花子 500円）
    105,   -- Stripe手数料（3.6%: 3,500 * 0.036 = 126円、簡略化のため105円）
    0,     -- プラットフォーム手数料（MVP段階では0%）
    3395,  -- 実際の送金額（3,500 - 105 - 0）
    'completed',
    'tr_test_1234567890',
    '2024-01-17 10:00:00+09'
);
