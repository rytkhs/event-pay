-- EventPay ENUM型定義マイグレーション
-- DB-001: ENUM型定義（イベントステータス、決済方法など）

-- ====================================================================
-- イベントステータスENUM
-- ====================================================================
-- イベントの進行状況を管理するENUM型
-- 'upcoming'（開催予定）→ 'ongoing'（開催中）→ 'past'（終了）
-- または 'cancelled'（キャンセル）に遷移可能
CREATE TYPE event_status_enum AS ENUM (
    'upcoming',     -- 開催予定（デフォルト）
    'ongoing',      -- 開催中
    'past',         -- 終了
    'cancelled'     -- キャンセル
);

-- ====================================================================
-- 決済方法ENUM
-- ====================================================================
-- EventPayで利用可能な決済方法を定義
-- 決済統合設計により、全ての決済方法を統一管理
CREATE TYPE payment_method_enum AS ENUM (
    'stripe',       -- オンライン決済（Stripe）
    'cash',         -- 現金決済（当日支払い）
    'free'          -- 無料イベント
);

-- ====================================================================
-- 決済ステータスENUM
-- ====================================================================
-- 決済状況の詳細な管理をサポート
-- 決済方法によって使用されるステータスが異なる
CREATE TYPE payment_status_enum AS ENUM (
    'pending',      -- 未決済（初期状態）
    'paid',         -- 決済済（Stripe決済完了）
    'failed',       -- 決済失敗（Stripe決済失敗）
    'received',     -- 受領済（現金決済受領）
    'completed',    -- 完了（無料イベント参加確定）
    'refunded',     -- 返金済（Stripe返金処理完了）
    'waived'        -- 免除（管理者による手動免除）
);

-- ====================================================================
-- 参加ステータスENUM
-- ====================================================================
-- 参加者の出欠意思を管理
-- 'maybe'は定員にカウントされず、決済も発生しない
CREATE TYPE attendance_status_enum AS ENUM (
    'attending',     -- 参加（決済対象）
    'not_attending', -- 不参加
    'maybe'         -- 未定（後で変更可能、決済なし）
);

-- ====================================================================
-- Stripe ConnectアカウントステータスENUM
-- ====================================================================
-- 運営者のStripe Connectアカウントの状況を管理
-- 決済受付の可否判定に使用
CREATE TYPE stripe_account_status_enum AS ENUM (
    'unverified',   -- 未認証（アカウント未設定）
    'onboarding',   -- オンボーディング中（設定途中）
    'verified',     -- 認証済（決済受付可能）
    'restricted'    -- 制限中（一時的な制限状態）
);

-- ====================================================================
-- 送金ステータスENUM
-- ====================================================================
-- 運営者への売上送金状況を管理
-- 自動送金システムの状況追跡に使用
CREATE TYPE payout_status_enum AS ENUM (
    'pending',      -- 送金待ち（イベント終了後5日以内）
    'processing',   -- 処理中（送金手続き実行中）
    'completed',    -- 完了（送金完了）
    'failed'        -- 失敗（送金処理失敗、要手動対応）
);

-- ====================================================================
-- データ整合性の確保
-- ====================================================================
-- ENUM型が正しく作成されたことを確認するためのコメント
COMMENT ON TYPE event_status_enum IS 'イベントの進行状況を管理するENUM型。MVPで使用する基本ステータス。';
COMMENT ON TYPE payment_method_enum IS '決済方法を統一管理するENUM型。Stripe/現金/無料の3種類をサポート。';
COMMENT ON TYPE payment_status_enum IS '決済状況の詳細管理用ENUM型。決済方法ごとに適切なステータスを設定。';
COMMENT ON TYPE attendance_status_enum IS '参加意思表明用ENUM型。maybeは定員対象外で決済も発生しない。';
COMMENT ON TYPE stripe_account_status_enum IS 'Stripe Connectアカウント状況管理用ENUM型。決済受付可否の判定に使用。';
COMMENT ON TYPE payout_status_enum IS '運営者への送金状況管理用ENUM型。自動送金システムで使用。';

-- ====================================================================
-- セキュリティと権限設定
-- ====================================================================
-- ENUM型はpublicスキーマに作成され、適切な権限が自動設定される
-- RLSポリシーは個別テーブルで設定するため、ここでは不要

-- ====================================================================
-- マイグレーション完了の確認
-- ====================================================================
-- 作成されたENUM型の確認クエリ（ログ出力用）
DO $$
DECLARE
    enum_count integer;
BEGIN
    SELECT COUNT(*) INTO enum_count
    FROM pg_type
    WHERE typname IN (
        'event_status_enum',
        'payment_method_enum',
        'payment_status_enum',
        'attendance_status_enum',
        'stripe_account_status_enum',
        'payout_status_enum'
    ) AND typtype = 'e';

    IF enum_count = 6 THEN
        RAISE NOTICE 'EventPay ENUM型の作成が完了しました。作成された型数: %', enum_count;
        RAISE NOTICE '次のENUM型が正常に作成されました:';
        RAISE NOTICE '- event_status_enum (4値)';
        RAISE NOTICE '- payment_method_enum (3値)';
        RAISE NOTICE '- payment_status_enum (7値)';
        RAISE NOTICE '- attendance_status_enum (3値)';
        RAISE NOTICE '- stripe_account_status_enum (4値)';
        RAISE NOTICE '- payout_status_enum (4値)';
    ELSE
        RAISE EXCEPTION 'ENUM型の作成に失敗しました。期待値: 6, 実際: %', enum_count;
    END IF;
END
$$;
