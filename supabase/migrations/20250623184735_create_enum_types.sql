-- =======================
-- ENUM型の定義（テーブル作成前に実行）
-- =======================

-- UUID拡張を有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE event_status_enum AS ENUM (
    'upcoming',     -- 開催予定
    'ongoing',      -- 開催中
    'past',         -- 終了
    'cancelled'     -- キャンセル
);

CREATE TYPE payment_method_enum AS ENUM (
    'stripe',       -- オンライン決済
    'cash',         -- 現金決済
    'free'          -- 無料
);

CREATE TYPE payment_status_enum AS ENUM (
    'pending',      -- 未決済
    'paid',         -- 決済済（Stripe）
    'failed',       -- 決済失敗
    'received',     -- 受領済（現金）
    'completed',    -- 完了（無料）
    'refunded',     -- 返金済
    'waived'        -- 免除
);

CREATE TYPE attendance_status_enum AS ENUM (
    'attending',     -- 参加
    'not_attending', -- 不参加
    'maybe'         -- 未定
);

CREATE TYPE stripe_account_status_enum AS ENUM (
    'unverified',   -- 未認証
    'onboarding',   -- オンボーディング中
    'verified',     -- 認証済
    'restricted'    -- 制限中
);

CREATE TYPE payout_status_enum AS ENUM (
    'pending',      -- 送金待ち
    'processing',   -- 処理中
    'completed',    -- 完了
    'failed'        -- 失敗
);
