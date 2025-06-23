-- =======================
-- RLSポリシーの設定
-- 🚨 セキュリティファースト: 最も厳格なポリシーを適用
-- =======================

-- usersテーブルのRLSポリシー
-- 基本原則: ユーザーは自分の情報のみアクセス可能
CREATE POLICY "Users can view own profile only" ON public.users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile only" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile only" ON public.users
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- eventsテーブルのRLSポリシー
-- 基本原則: 認証済みユーザーは全イベントを閲覧可能、作成者のみ編集可能
CREATE POLICY "Authenticated users can view events" ON public.events
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can create events" ON public.events
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Event creators can update own events" ON public.events
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Event creators can delete own events" ON public.events
    FOR DELETE
    TO authenticated
    USING (auth.uid() = created_by);

-- attendancesテーブルのRLSポリシー
-- 基本原則: イベント作成者のみ参加者情報を閲覧可能、クライアントからの直接操作は禁止
CREATE POLICY "Event creators can view attendances" ON public.attendances
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events
            WHERE events.id = attendances.event_id
            AND events.created_by = auth.uid()
        )
    );

-- attendancesテーブルのINSERT/UPDATE/DELETEは禁止（サーバーサイドAPIのみ）
-- 注意: 実際のアプリケーションではAPI経由でのみ操作を行う

-- paymentsテーブルのRLSポリシー
-- 基本原則: イベント作成者のみ決済情報を閲覧可能、クライアントからの直接操作は禁止
CREATE POLICY "Event creators can view payments" ON public.payments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.attendances
            JOIN public.events ON events.id = attendances.event_id
            WHERE attendances.id = payments.attendance_id
            AND events.created_by = auth.uid()
        )
    );

-- paymentsテーブルのINSERT/UPDATE/DELETEは禁止（サーバーサイドAPIのみ）

-- stripe_connect_accountsテーブルのRLSポリシー
-- 基本原則: 自分のStripeアカウント情報のみアクセス可能
CREATE POLICY "Users can view own stripe connect account" ON public.stripe_connect_accounts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own stripe connect account" ON public.stripe_connect_accounts
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own stripe connect account" ON public.stripe_connect_accounts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- payoutsテーブルのRLSポリシー
-- 基本原則: 自分のイベントの送金情報のみ閲覧可能、サーバーサイドAPIのみ操作可能
CREATE POLICY "Event creators can view own payouts" ON public.payouts
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.events
            WHERE events.id = payouts.event_id
            AND events.created_by = auth.uid()
        )
    );

-- payoutsテーブルのINSERT/UPDATE/DELETEは禁止（サーバーサイドAPIのみ）

-- =======================
-- 安全な公開情報アクセス用ビューの作成
-- =======================

-- public_profilesビュー: ユーザーの公開情報のみを表示
CREATE VIEW public.public_profiles AS
SELECT
    id,
    name,
    created_at
FROM public.users;

-- public_profilesビューのRLSポリシー
ALTER VIEW public.public_profiles SET (security_invoker = true);

-- イベント作成者名を安全に取得する関数
CREATE OR REPLACE FUNCTION public.get_event_creator_name(event_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    creator_name TEXT;
BEGIN
    SELECT users.name INTO creator_name
    FROM public.users
    JOIN public.events ON events.created_by = users.id
    WHERE events.id = event_id;

    RETURN creator_name;
END;
$$;

-- =======================
-- Webhook処理用の原子的関数
-- =======================

-- 決済Webhook処理用の原子的関数
CREATE OR REPLACE FUNCTION public.process_payment_webhook_atomic(
    payment_intent_id VARCHAR(255),
    webhook_event_id VARCHAR(100),
    amount_received INTEGER,
    processed_at TIMESTAMP WITH TIME ZONE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 既に処理済みかチェック（最終的な二重処理防止）
    IF EXISTS(
        SELECT 1 FROM public.payments
        WHERE stripe_payment_intent_id = payment_intent_id
        AND webhook_processed_at IS NOT NULL
    ) THEN
        RETURN; -- 既に処理済みの場合は何もしない
    END IF;

    -- 決済情報を更新（冪等性キーも同時に記録）
    UPDATE public.payments
    SET
        status = 'paid',
        paid_at = processed_at,
        webhook_event_id = webhook_event_id,
        webhook_processed_at = processed_at,
        updated_at = processed_at
    WHERE stripe_payment_intent_id = payment_intent_id;

    -- 更新行数が0の場合はエラー
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment record not found for payment_intent_id: %', payment_intent_id;
    END IF;
END;
$$;

-- 送金Webhook処理用の原子的関数
CREATE OR REPLACE FUNCTION public.process_payout_webhook_atomic(
    stripe_transfer_id VARCHAR(255),
    webhook_event_id VARCHAR(100),
    processed_at TIMESTAMP WITH TIME ZONE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 既に処理済みかチェック
    IF EXISTS(
        SELECT 1 FROM public.payouts
        WHERE stripe_transfer_id = stripe_transfer_id
        AND webhook_processed_at IS NOT NULL
    ) THEN
        RETURN;
    END IF;

    -- 送金情報を更新
    UPDATE public.payouts
    SET
        status = 'completed',
        webhook_event_id = webhook_event_id,
        webhook_processed_at = processed_at,
        processed_at = processed_at,
        updated_at = processed_at
    WHERE stripe_transfer_id = stripe_transfer_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payout record not found for transfer_id: %', stripe_transfer_id;
    END IF;
END;
$$;
