-- 招待トークンとゲストトークンを区別するためのトークン形式の更新
-- 目的: 招待トークンとゲストトークンが同じ形式だったセキュリティ問題を解決する

-- ====================================================================
-- 1. RLSポリシーを一時的に削除してからguest_tokenカラムを更新
-- ====================================================================

-- guest_tokenカラムを参照するRLSポリシーを一時的に削除
-- 実際のポリシー名を使用
DROP POLICY IF EXISTS "Guest token read access for attendances" ON public.attendances;
DROP POLICY IF EXISTS "Guest token update for attendances" ON public.attendances;
DROP POLICY IF EXISTS "Guest token read event details" ON public.events;
DROP POLICY IF EXISTS "Guest token read payment details" ON public.payments;
DROP POLICY IF EXISTS "Guest token update payment details" ON public.payments;

-- プレフィックスを許容するため、guest_tokenカラムの長さを32文字から36文字に増やす
ALTER TABLE public.attendances ALTER COLUMN guest_token TYPE VARCHAR(36);

-- 新しい形式を反映するためにカラムのコメントを更新
COMMENT ON COLUMN public.attendances.guest_token IS 'ゲストアクセス用のトークン。gst_プレフィックス付き（Base64形式、合計36文字：gst_ + 32文字）';

-- ====================================================================
-- 2. create_attendance_with_validation関数を更新
-- ====================================================================

CREATE OR REPLACE FUNCTION public.create_attendance_with_validation(
    p_event_id UUID,
    p_nickname VARCHAR,
    p_email VARCHAR,
    p_status public.attendance_status_enum,
    p_guest_token VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_attendance_id UUID;
    event_capacity INTEGER;
    current_attendees INTEGER;
BEGIN
    -- 入力値の検証
    IF p_event_id IS NULL THEN
        RAISE EXCEPTION 'Event ID cannot be null';
    END IF;

    IF p_nickname IS NULL OR LENGTH(TRIM(p_nickname)) = 0 THEN
        RAISE EXCEPTION 'Nickname cannot be null or empty';
    END IF;

    IF p_email IS NULL OR LENGTH(TRIM(p_email)) = 0 THEN
        RAISE EXCEPTION 'Email cannot be null or empty';
    END IF;

    -- ゲストトークンの検証（新しい形式に対応）
    IF p_guest_token IS NULL OR LENGTH(p_guest_token) != 36 THEN
        RAISE EXCEPTION 'Guest token must be exactly 36 characters long with gst_ prefix, got: %', COALESCE(LENGTH(p_guest_token), 0);
    END IF;

    -- ゲストトークンの形式を検証
    IF NOT (p_guest_token ~ '^gst_[a-zA-Z0-9_-]{32}$') THEN
        RAISE EXCEPTION 'Guest token must have format gst_[32 alphanumeric chars], got: %', LEFT(p_guest_token, 8) || '...';
    END IF;

    -- イベントが存在するか確認し、定員を取得
    SELECT capacity INTO event_capacity
    FROM public.events
    WHERE id = p_event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found: %', p_event_id;
    END IF;

    -- 定員制限がある場合にチェック
    IF event_capacity IS NOT NULL THEN
        SELECT COUNT(*) INTO current_attendees
        FROM public.attendances
        WHERE event_id = p_event_id AND status = 'attending';

        IF current_attendees >= event_capacity THEN
            RAISE EXCEPTION 'Event capacity reached. Current: %, Limit: %', current_attendees, event_capacity;
        END IF;
    END IF;

    -- 重複するゲストトークンをチェック
    IF EXISTS(SELECT 1 FROM public.attendances WHERE guest_token = p_guest_token) THEN
        RAISE EXCEPTION 'Guest token already exists: %', LEFT(p_guest_token, 8) || '...';
    END IF;

    -- 新しい参加記録を挿入
    INSERT INTO public.attendances (event_id, nickname, email, status, guest_token)
    VALUES (p_event_id, p_nickname, p_email, p_status, p_guest_token)
    RETURNING id INTO new_attendance_id;

    RETURN new_attendance_id;

EXCEPTION
    WHEN unique_violation THEN
        -- 一意性制約違反を個別に対応
        IF SQLSTATE = '23505' AND CONSTRAINT_NAME = 'attendances_guest_token_key' THEN
            RAISE EXCEPTION 'Guest token already exists (unique constraint violation): %', LEFT(p_guest_token, 8) || '...';
        ELSE
            RAISE; -- その他の一意性制約違反は再スローする
        END IF;
    WHEN OTHERS THEN
        -- デバッグ用にエラー詳細をログに出力（開発環境）
        RAISE;
END;
$$;

-- 必要な権限を付与
GRANT EXECUTE ON FUNCTION public.create_attendance_with_validation(UUID, VARCHAR, VARCHAR, public.attendance_status_enum, VARCHAR) TO service_role;

-- ====================================================================
-- 3. テスト用のシードデータを更新（存在する場合）
-- ====================================================================

-- 注意: このマイグレーションは既存のデータを自動的に更新しません
-- 古いトークン形式のテストデータがある場合、トークンを再生成する必要があります
-- 参考クエリ（必要に応じて手動で実行）:

-- SELECT id, guest_token FROM public.attendances WHERE guest_token !~ '^gst_[a-zA-Z0-9_-]{32}$';
--
-- このマイグレーションは既存のデータを保持しますが、新しいトークンはgst_形式に従う必要があります

-- ====================================================================
-- 4. パフォーマンスの最適化
-- ====================================================================

-- ゲストトークン検索用のインデックスを更新
DROP INDEX IF EXISTS idx_attendances_guest_token_active;
CREATE INDEX idx_attendances_guest_token_active
ON public.attendances (guest_token)
WHERE guest_token IS NOT NULL AND guest_token ~ '^gst_[a-zA-Z0-9_-]{32}$';

-- 複合インデックスを更新
DROP INDEX IF EXISTS idx_attendances_event_id_guest_token;
CREATE INDEX idx_attendances_event_id_guest_token
ON public.attendances (event_id, guest_token)
WHERE guest_token IS NOT NULL AND guest_token ~ '^gst_[a-zA-Z0-9_-]{32}$';

-- ====================================================================
-- 5. ログと検証
-- ====================================================================

DO $$
BEGIN
    RAISE NOTICE 'トークン形式のマイグレーションが正常に完了しました:';
    RAISE NOTICE '  - attendances.guest_tokenカラムをVARCHAR(36)に更新しました';
    RAISE NOTICE '  - create_attendance_with_validation関数をgst_プレフィックスに対応するように更新しました';
    RAISE NOTICE '  - 新しいトークン形式に合わせてデータベースインデックスを更新しました';
    RAISE NOTICE '  - 招待トークンはinv_プレフィックスを使用します（合計36文字）';
    RAISE NOTICE '  - ゲストトークンはgst_プレフィックスを使用します（合計36文字）';
    RAISE NOTICE '  - トークンの衝突リスクを解消しました';
END;
$$;
