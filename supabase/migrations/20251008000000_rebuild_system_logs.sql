-- ============================================================================
-- system_logs テーブル再設計
-- 業界標準（ECS、OpenTelemetry、OWASP）に準拠した監査ログシステム
-- ============================================================================

-- 既存テーブルのドロップ（開発段階のため一括移行）
DROP TABLE IF EXISTS public.system_logs CASCADE;

-- ============================================================================
-- ENUM型定義
-- ============================================================================

-- ログレベル（Syslog RFC 5424 準拠）
CREATE TYPE public.log_level_enum AS ENUM (
  'debug',    -- デバッグ情報（開発時のみ）
  'info',     -- 通常の情報イベント
  'warn',     -- 警告（処理は継続）
  'error',    -- エラー（機能に影響）
  'critical'  -- 重大なエラー（システム全体に影響）
);

-- ログカテゴリ（アプリケーションドメイン別分類）
CREATE TYPE public.log_category_enum AS ENUM (
  'authentication',    -- 認証（ログイン、ログアウト、トークン検証）
  'authorization',     -- 認可（権限チェック、アクセス制御）
  'event_management',  -- イベント管理（作成、更新、削除、公開）
  'attendance',        -- 出欠管理（参加登録、ステータス変更、キャンセル）
  'payment',           -- 決済処理（Checkout作成、ステータス更新、返金）
  'settlement',        -- 清算処理（レポート生成、送金）
  'stripe_webhook',    -- Stripe Webhook受信処理
  'stripe_connect',    -- Stripe Connect（オンボーディング、アカウント更新）
  'email',             -- メール送信（通知、リマインダー）
  'export',            -- データエクスポート（CSV、PDF）
  'security',          -- セキュリティイベント（不正アクセス、XSS、レート制限）
  'system'             -- システム操作（設定変更、メンテナンス）
);

-- 処理結果（OpenTelemetry event.outcome 準拠）
CREATE TYPE public.log_outcome_enum AS ENUM (
  'success',  -- 成功
  'failure',  -- 失敗
  'unknown'   -- 不明（処理中、タイムアウト等）
);

-- アクター種別（誰が操作を実行したか）
CREATE TYPE public.actor_type_enum AS ENUM (
  'user',           -- 認証済みユーザー
  'guest',          -- ゲストユーザー（guest_token使用）
  'system',         -- システム（自動処理、バッチ等）
  'webhook',        -- Webhook（Stripe、外部サービス）
  'service_role',   -- サービスロール（管理操作）
  'anonymous'       -- 匿名（未認証アクセス）
);

COMMENT ON TYPE public.log_level_enum IS 'ログレベル（RFC 5424準拠）';
COMMENT ON TYPE public.log_category_enum IS 'ログカテゴリ（アプリケーションドメイン別）';
COMMENT ON TYPE public.log_outcome_enum IS '処理結果（OpenTelemetry準拠）';
COMMENT ON TYPE public.actor_type_enum IS 'アクター種別（操作実行者の分類）';

-- ============================================================================
-- system_logs テーブル
-- ============================================================================

CREATE TABLE public.system_logs (
  -- ============================================================================
  -- 主キーと基本情報
  -- ============================================================================
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- ログレベルとカテゴリ
  log_level public.log_level_enum NOT NULL DEFAULT 'info',
  log_category public.log_category_enum NOT NULL,

  -- ============================================================================
  -- 6W1H: 監査証跡の基本要素
  -- ============================================================================

  -- Who（誰が）
  actor_type public.actor_type_enum NOT NULL DEFAULT 'system',
  actor_identifier text,  -- user_id、guest_token、webhook名、IPアドレス等
  user_id uuid,           -- 認証済みユーザーID（users.id外部キー）

  -- What（何を）
  action text NOT NULL,              -- 実行されたアクション（例: event.create, payment.update）
  resource_type text,                -- 操作対象のリソース種別（例: event, payment, attendance）
  resource_id text,                  -- 操作対象のリソースID（UUIDやStripe ID等）

  -- When（いつ） → created_at で表現

  -- Where（どこで）
  ip_address inet,                   -- クライアントIPアドレス（マスキング推奨）
  user_agent text,                   -- User-Agent文字列

  -- Why（なぜ）& How（どのように）
  message text NOT NULL,             -- 人間可読なログメッセージ
  outcome public.log_outcome_enum NOT NULL DEFAULT 'success',

  -- ============================================================================
  -- トレーサビリティ（分散トレーシング対応）
  -- ============================================================================
  request_id text,           -- Next.jsリクエストID（x-request-id等）
  session_id text,           -- セッションID（Supabase session、iron-session等）

  -- Stripe関連トレーシング
  stripe_request_id text,    -- Stripe Request-Id（障害調査用）
  stripe_event_id text,      -- Stripe Event ID（webhook処理追跡）
  idempotency_key text,      -- Stripe Idempotency-Key（冪等性保証）

  -- ============================================================================
  -- 拡張情報
  -- ============================================================================
  metadata jsonb,            -- 構造化された追加情報（柔軟な拡張用）
  tags text[],               -- フリータグ（検索・集計用）

  -- エラー情報（failure時のみ使用）
  error_code text,           -- アプリケーション定義のエラーコード
  error_message text,        -- エラーメッセージ
  error_stack text,          -- スタックトレース（開発環境のみ推奨）

  -- ============================================================================
  -- 重複防止（Deduplication）
  -- ============================================================================
  dedupe_key text,           -- 重複防止キー（冪等性保証用、UNIQUE制約）

  -- ============================================================================
  -- 制約
  -- ============================================================================
  CONSTRAINT system_logs_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================================
-- インデックス
-- ============================================================================

-- 時系列検索（最頻利用）
CREATE INDEX idx_system_logs_created_at ON public.system_logs (created_at DESC);

-- ユーザー別ログ検索
CREATE INDEX idx_system_logs_user_id ON public.system_logs (user_id)
  WHERE user_id IS NOT NULL;

-- カテゴリ別検索
CREATE INDEX idx_system_logs_category ON public.system_logs (log_category, created_at DESC);

-- レベル別検索（エラー監視用）
CREATE INDEX idx_system_logs_level ON public.system_logs (log_level, created_at DESC);

-- アクション別検索（監査調査用）
CREATE INDEX idx_system_logs_action ON public.system_logs (action, created_at DESC);

-- リソース追跡用（特定リソースの操作履歴取得）
CREATE INDEX idx_system_logs_resource ON public.system_logs (resource_type, resource_id, created_at DESC)
  WHERE resource_type IS NOT NULL AND resource_id IS NOT NULL;

-- Stripe連携追跡用
CREATE INDEX idx_system_logs_stripe_event ON public.system_logs (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX idx_system_logs_stripe_request ON public.system_logs (stripe_request_id)
  WHERE stripe_request_id IS NOT NULL;

-- リクエストトレーシング用
CREATE INDEX idx_system_logs_request_id ON public.system_logs (request_id)
  WHERE request_id IS NOT NULL;

-- エラーログ専用インデックス（障害調査の高速化）
CREATE INDEX idx_system_logs_errors ON public.system_logs (log_level, created_at DESC)
  WHERE log_level IN ('error', 'critical');

-- JSONB metadata検索用（GINインデックス）
CREATE INDEX idx_system_logs_metadata ON public.system_logs USING gin (metadata);

-- タグ配列検索用（GINインデックス）
CREATE INDEX idx_system_logs_tags ON public.system_logs USING gin (tags);

-- 重複防止キー用（UNIQUE制約付き部分インデックス）
-- NULL値は重複チェック対象外（dedupe不要なログには設定しない）
CREATE UNIQUE INDEX idx_system_logs_dedupe_key ON public.system_logs (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- service_role のみアクセス可能（セキュリティ監査ログ保護）
CREATE POLICY "system_logs are accessible only by service_role"
  ON public.system_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 権限設定
-- ============================================================================

-- service_role のみ全権限
GRANT ALL ON TABLE public.system_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.system_logs_id_seq TO service_role;

-- anon と authenticated はアクセス不可（RLSで保護）
REVOKE ALL ON TABLE public.system_logs FROM anon;
REVOKE ALL ON TABLE public.system_logs FROM authenticated;
REVOKE ALL ON SEQUENCE public.system_logs_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.system_logs_id_seq FROM authenticated;

-- ============================================================================
-- テーブルとカラムのコメント
-- ============================================================================

COMMENT ON TABLE public.system_logs IS
'アプリケーション監査ログテーブル（ECS、OpenTelemetry、OWASP準拠）

用途:
- 認証・認可イベントの記録
- CRUD操作の監査証跡
- 決済・清算処理の追跡
- セキュリティイベントの検出
- Stripe連携の障害調査

保存期間: 1年（パフォーマンス要件に応じて定期削除推奨）
アクセス制御: service_role のみ（RLS有効）';

-- 基本情報
COMMENT ON COLUMN public.system_logs.id IS '一意な識別子（自動採番）';
COMMENT ON COLUMN public.system_logs.created_at IS 'ログ記録日時（UTC）';
COMMENT ON COLUMN public.system_logs.log_level IS 'ログレベル（debug/info/warn/error/critical）';
COMMENT ON COLUMN public.system_logs.log_category IS 'ログカテゴリ（アプリケーションドメイン別）';

-- 6W1H
COMMENT ON COLUMN public.system_logs.actor_type IS '【Who】アクター種別（user/guest/system/webhook/service_role/anonymous）';
COMMENT ON COLUMN public.system_logs.actor_identifier IS '【Who】アクター識別子（user_id、guest_token、webhook名、IPアドレス等）';
COMMENT ON COLUMN public.system_logs.user_id IS '【Who】認証済みユーザーID（auth.users.id への外部キー）';
COMMENT ON COLUMN public.system_logs.action IS '【What】実行されたアクション（例: event.create, payment.update, user.login）';
COMMENT ON COLUMN public.system_logs.resource_type IS '【What】操作対象のリソース種別（例: event, payment, attendance）';
COMMENT ON COLUMN public.system_logs.resource_id IS '【What】操作対象のリソースID（UUID、Stripe ID等）';
COMMENT ON COLUMN public.system_logs.ip_address IS '【Where】クライアントIPアドレス（PII保護のためマスキング推奨）';
COMMENT ON COLUMN public.system_logs.user_agent IS '【Where】User-Agent文字列（ブラウザ・デバイス情報）';
COMMENT ON COLUMN public.system_logs.message IS '【Why】人間可読なログメッセージ';
COMMENT ON COLUMN public.system_logs.outcome IS '【How】処理結果（success/failure/unknown）';

-- トレーサビリティ
COMMENT ON COLUMN public.system_logs.request_id IS 'リクエストID（分散トレーシング用）';
COMMENT ON COLUMN public.system_logs.session_id IS 'セッションID（ユーザーセッション追跡用）';
COMMENT ON COLUMN public.system_logs.stripe_request_id IS 'Stripe Request-Id（Stripe API障害調査用）';
COMMENT ON COLUMN public.system_logs.stripe_event_id IS 'Stripe Event ID（Webhook処理追跡用）';
COMMENT ON COLUMN public.system_logs.idempotency_key IS 'Stripe Idempotency-Key（冪等性保証用）';

-- 拡張情報
COMMENT ON COLUMN public.system_logs.metadata IS '構造化された追加情報（JSONB形式、柔軟な拡張用）';
COMMENT ON COLUMN public.system_logs.tags IS 'フリータグ配列（検索・集計用）';
COMMENT ON COLUMN public.system_logs.error_code IS 'エラーコード（failure時のみ、アプリ定義）';
COMMENT ON COLUMN public.system_logs.error_message IS 'エラーメッセージ（failure時のみ）';
COMMENT ON COLUMN public.system_logs.error_stack IS 'スタックトレース（failure時のみ、開発環境推奨）';

-- 重複防止
COMMENT ON COLUMN public.system_logs.dedupe_key IS '重複防止キー（冪等性保証用）。同一キーのログは1度のみ記録される。
NULL値の場合は重複チェックなし。
形式例:
- Webhook: webhook:{stripe_event_id}
- Transaction: tx:{action}:{resource_id}:{timestamp_ms}
- Idempotent: idempotent:{idempotency_key}
- Custom: {log_category}:{unique_identifier}';
