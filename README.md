# みんなの集金 (EventPay)

> 小・中規模コミュニティ向けのイベント出欠管理・集金ツール
> 参加の確認から集金まで、リンクの共有だけで完了できる新しいサービス

[![Production](https://img.shields.io/badge/production-minnano--shukin.com-blue)](https://minnano-shukin.com)

## 📋 目次

- [概要](#概要)
- [主な機能](#主な機能)
- [技術スタック](#技術スタック)
- [プロジェクト構成](#プロジェクト構成)
- [必要要件](#必要要件)
- [セットアップ](#セットアップ)
- [開発](#開発)
- [テスト](#テスト)
- [デプロイ](#デプロイ)
- [環境変数](#環境変数)
- [アーキテクチャ](#アーキテクチャ)

## 概要

みんなの集金は、会計担当者の負担を大幅に削減することを目標に開発された、イベント出欠管理と集金を統合したWebアプリケーションです。Next.js 14 App Router、Supabase、Stripe Connect、Cloudflare Workersを組み合わせて構築されています。

### 対象ユーザー

- 大学サークル・社会人サークル
- PTA・町内会
- スポーツチーム
- その他小・中規模コミュニティイベント

## 主な機能

### イベント管理
- **多段階フォーム**: ステップバイステップのイベント作成
- **柔軟な支払い設定**: 無料イベント、現金のみ、オンライン決済、両方対応
- **期限管理**: 出欠登録期限、支払期限、猶予期間の設定
- **変更検知**: 参加者・決済状況に応じた編集制限

### 招待・出欠管理
- **トークンベース招待**: アカウント不要でゲスト参加可能
- **定員管理**: 自動的な定員制御
- **出欠状況確認**: 参加状況確認

### 決済機能
- **現金管理**: 手動での集金ステータス追跡
- **Stripe決済**: セキュアなオンライン決済
- **Stripe Connect**: 主催者の銀行口座への直接振込
- **冪等性保証**: 安全な決済リトライ機構

### 通知・リマインダー
- **自動リマインダー**: 期限前の自動通知
- **メール通知**: Resend経由での各種通知
- **管理者通知**: Slack連携

### その他
- **CSVエクスポート**: 参加者・決済データのエクスポート
- **セキュリティ**: CSP、レート制限、XSS対策
- **アナリティクス**: Google Analytics 4統合
- **メンテナンスモード**: 計画的なメンテナンス対応

## 技術スタック

### フレームワーク・ランタイム
- **Next.js 14**: App Router + Server Actions
- **React 18**: UIライブラリ
- **TypeScript 5**: 型安全性
- **Cloudflare Workers**: エッジコンピューティング (via OpenNext)

### バックエンド・データベース
- **Supabase**: 認証・データベース（PostgreSQL）
  - `@supabase/ssr`: SSR対応クライアント
  - `@supabase/supabase-js`: JavaScript SDK

### 決済
- **Stripe**: 決済処理
  - Stripe Connect Express: 主催者への直接振込
  - Stripe Checkout: セキュアな決済フロー

### UI・スタイリング
- **Tailwind CSS**: ユーティリティファーストCSS
- **shadcn/ui**: Radix UIベースのコンポーネント

### フォーム・バリデーション
- **React Hook Form**: フォーム状態管理
- **Zod**: スキーマバリデーション

### その他サービス
- **Upstash Redis**: レート制限・キャッシュ
- **QStash**: 非同期タスクキュー
- **Resend**: メール配信
- **Cloudflare R2**: インクリメンタルキャッシュストレージ

### 開発ツール
- **Jest**: ユニットテスト
- **Playwright**: E2Eテスト
- **ESLint**: コード品質
- **Prettier**: コードフォーマット
- **Husky + lint-staged**: プリコミットフック

## プロジェクト構成

```
event-pay/
├── app/                    # Next.js App Router ページ
│   ├── (auth)/            # 認証関連ページ
│   ├── (dashboard)/       # ダッシュボード
│   ├── (marketing)/       # ランディングページ
│   ├── (public)/          # 公開ページ
│   └── api/               # API Routes & Webhooks
├── features/              # 機能モジュール（ドメイン駆動）
│   ├── auth/             # 認証機能
│   ├── events/           # イベント管理
│   ├── guest/            # ゲスト機能
│   ├── invite/           # 招待機能
│   ├── payments/         # 決済処理
│   ├── settings/         # 設定管理
│   ├── settlements/      # 精算管理
│   └── stripe-connect/   # Stripe Connect統合
├── core/                  # 共有ユーティリティ
│   ├── actions/          # 共通Server Actions
│   ├── auth/             # 認証ロジック
│   ├── logging/          # ロギング (pino)
│   ├── security/         # セキュリティ機能
│   ├── stripe/           # Stripe共通処理
│   ├── supabase/         # Supabase クライアント
│   ├── utils/            # ユーティリティ関数
│   └── validation/       # バリデーションスキーマ
├── components/            # UIコンポーネント
│   └── ui/               # 再利用可能なUIコンポーネント
├── types/                 # 型定義
├── supabase/             # Supabase設定
│   ├── migrations/       # DBマイグレーション
│   └── seed.sql          # シードデータ
├── tests/                # テストファイル
│   ├── e2e/             # E2Eテスト (Playwright)
│   └── unit/            # ユニットテスト (Jest)
├── emails/               # メールテンプレート (React Email)
├── .github/              # GitHub Actions設定
├── next.config.mjs       # Next.js設定
├── open-next.config.ts   # OpenNext設定
├── wrangler.jsonc        # Cloudflare Workers設定
└── middleware.ts         # Next.js Middleware
```

## 必要要件

- **Node.js**: 20以上
- **npm**: 10以上
- **Supabase CLI**: ローカルDB操作用
- **Stripe CLI**: Webhook転送用
- **Wrangler CLI**: Cloudflareデプロイ用

### インストール

```bash
# Node.js (推奨: nvm使用)
nvm install 20
nvm use 20

# Supabase CLI
npm install -g supabase

# Stripe CLI
# https://stripe.com/docs/stripe-cli

# Wrangler CLI (グローバルインストール不要、devDependenciesに含まれる)
```

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/rytkhs/event-pay.git
cd event-pay
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local`を編集して必要な値を設定してください。主要な環境変数については[環境変数](#環境変数)セクションを参照してください。

### 4. Supabaseのセットアップ（ローカル開発）

```bash
# Supabaseローカル環境の起動
supabase start

# データベースのリセット（初回または更新時）
npm run db:reset

# マイグレーションの適用
npm run db:migrate
```

## 開発

### ローカルサーバーの起動

```bash
npm run dev
```

アプリケーションは `http://localhost:3000` で起動します。

### Stripe Webhookのテスト

開発環境でStripe Webhookをテストするには、別のターミナルで：

```bash
# ローカル環境用
npm run stripe:listen
```

### コード品質チェック

```bash
# ESLintチェック
npm run lint

# ESLint自動修正
npm run lint:fix

# 型チェック
npm run typecheck

# Prettierフォーマット
npm run format

# フォーマットチェック
npm run format:check

# 全てのチェック実行
npm run check:all
```

### メールテンプレートのプレビュー

```bash
npm run email:dev
```

## テスト

### ユニットテスト（Jest）

```bash
# ユニットテスト実行
npm run test:unit

# ウォッチモード
npm run test:unit:watch

# カバレッジレポート
npm run test:unit:coverage
```

### E2Eテスト（Playwright）

```bash
# E2Eテスト実行
npm run test:e2e

# ヘッドモードで実行（ブラウザ表示）
npm run test:e2e:headed

# デバッグモード
npm run test:e2e:debug
```

### 全テスト実行

```bash
# テスト環境のセットアップ
npm run test:setup

# 全テスト実行
npm run test

# CI環境用
npm run test:ci
```

## デプロイ

このプロジェクトはCloudflare Workers上でOpenNextを使用してデプロイされます。

### 前提条件

1. Cloudflare R2バケット `cache` を作成
2. Wranglerでログイン: `npx wrangler login`
3. 環境変数をCloudflare Dashboardで設定

### デプロイコマンド

```bash
# プレビューデプロイ
npm run preview

# 本番デプロイ
npm run deploy

# アセットのみアップロード
npm run upload

# Cloudflare型生成
npm run cf-typegen
```

### Cloudflare Workers設定

本番環境は `minnano-shukin.com` ドメインで動作します。

### R2インクリメンタルキャッシュ

OpenNextのR2インクリメンタルキャッシュを使用して、ページキャッシュを高速化しています。

## 環境変数

### 必須環境変数

#### Supabase
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

#### Stripe
```env
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_your-connect-webhook-secret
```

#### アプリケーション
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

#### セキュリティ（レート制限）
```env
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
RL_HMAC_SECRET=your-random-secret-min-32-chars
```

#### メール送信
```env
RESEND_API_KEY=re_your-resend-api-key
FROM_EMAIL=noreply@example.com
ADMIN_EMAIL=admin@example.com
```

#### LINE ログイン
```env
NEXT_PUBLIC_LINE_CHANNEL_ID=your-channel-id
LINE_CHANNEL_SECRET=your-channel-secret
```
**Callback URL**: `${NEXT_PUBLIC_APP_URL}/auth/callback/line`


### オプション環境変数

#### Cron認証
```env
CRON_SECRET=your-random-secret-min-32-chars
```

#### Google Analytics 4
```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
GA_API_SECRET=your-ga4-api-secret
```

#### Slack通知
```env
SLACK_CONTACT_WEBHOOK_URL=your-slack-webhook-url
```

#### QStash（非同期処理）
```env
QSTASH_URL=your-qstash-url
QSTASH_TOKEN=your-token
QSTASH_CURRENT_SIGNING_KEY=your-key
QSTASH_NEXT_SIGNING_KEY=your-next-key
```

#### メンテナンスモード
```env
MAINTENANCE_MODE=false
MAINTENANCE_BYPASS_TOKEN=your-bypass-token
```

## アーキテクチャ

### レイヤードアーキテクチャ

このプロジェクトは厳格なレイヤードアーキテクチャに従っており、ESLintで依存関係が強制されています：

```
app/ (Pages & API Routes)
  ↓
features/ (ドメインロジック)
  ↓
core/ (共有ユーティリティ)
  ↓
components/ui/ (純粋UIコンポーネント)
  ↓
types/ (型定義)
```

### 機能モジュール

各機能は独立したモジュールとして `features/` 配下に配置され、以下の構造を持ちます：

- `actions/`: Server Actions（データ変更）
- `components/`: 機能固有のUIコンポーネント
- `hooks/`: 機能固有のReactフック
- `index.ts`: 公開API（必須）

### セキュリティ

- **CSP**: 厳格なContent Security Policy
- **セキュリティヘッダー**: X-Frame-Options, HSTS等
- **レート制限**: Upstash Redisベース
- **XSS対策**: 入力値のサニタイゼーション
- **RLS**: Supabase Row Level Security

### 認証・認可

- Supabase Authによる認証
- JWTベースのセッション管理
- Row Level Security (RLS)によるデータアクセス制御
- トークンベースのゲストアクセス
