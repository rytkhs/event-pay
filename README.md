# みんなの集金 (EventPay)

> クローズドコミュニティ向けのイベント出欠管理・集金ツール。
> 出欠確認〜集金まで「招待リンクを共有するだけ」で完了。

[![Production](https://img.shields.io/badge/production-minnano--shukin.com-blue)](https://minnano-shukin.com)

## 概要

**みんなの集金 (EventPay)** は、イベントの出欠確認と集金を一体化し、幹事・会計担当の運用負担を減らすことを目的としたWebアプリケーションです。
Next.js App Router を中心に、Supabase と Stripe（Connect含む）を組み合わせ、Cloudflare Workers 上にデプロイする構成です。

<img width="1625" height="917" alt="Image" src="https://github.com/user-attachments/assets/c6c7e3a8-b27b-4aa0-9d18-3da60b6e8851" />

### 解決した課題

**従来の課題:**
- 出欠確認はLINE、集金は現金手渡し→二重管理・抜け漏れ
- 会計担当が現金を立て替え→精神的・金銭的負担大
- 誰が払ったか分からず、催促の手間がかかる

**本システムの解決策:**
- Stripeでキャッシュレス集金
- 出欠・決済を1つのシステムで統合管理
- リマインダー自動送信で催促業務も自動化

想定ユースケース:
- 大学サークル / 社会人サークル
- PTA / 町内会
- スポーツチーム
- 小〜中規模クローズドコミュニティのイベント運営全般

## 主な機能

### イベント管理
- イベント作成。
- 支払い設定（無料 / 現金のみ / オンライン決済 / 両方）。
- 出欠登録期限・支払期限・猶予期間などの期限管理。
- 参加者・決済状況に応じた編集制限（変更検知）。

### 招待・出欠管理
- トークンベース招待（参加者はアカウント不要でゲスト参加）。
- 定員管理と出欠状況の可視化。

### 決済・集金
- 現金集金のステータス追跡（手動管理）。
- Stripe Checkout によるオンライン決済。
- Stripe Connect（Express）による主催者口座への振込導線。
- 冪等性を意識した決済リトライ設計。

### 通知・運用
- 期限前の自動リマインダー。
- メール通知（Resend）、管理者通知（Slack連携）。
- CSVエクスポート、メンテナンスモードなどの運用機能。

## 技術スタック

主要技術:
- Next.js 14（App Router / Server Actions）
- React 18 / TypeScript 5
- Supabase（PostgreSQL / Auth / RLS）
- Stripe（Checkout / Connect Express）
- Cloudflare Workers（OpenNext 経由）+ R2（インクリメンタルキャッシュ用途）

周辺:
- Tailwind CSS / shadcn/ui
- React Hook Form / Zod
- Upstash Redis（レート制限）
- QStash（非同期処理）
- Resend（メール）
- Jest / Playwright / ESLint / Prettier

## アーキテクチャ概要

このリポジトリは、`app/`（UI・ルーティング）→ `features/`（ドメイン/ユースケース）→ `core/`（横断ユーティリティ）というレイヤを意識した構成です。
依存関係の逆流を防ぐため、ルールをESLint等で強制する前提の設計です。

## 開発用ドキュメント

設計の詳細や意思決定の背景については、以下のドキュメントを参照してください。

- [アーキテクチャ詳細](./docs/architecture.md) - システム構成、シーケンス図、レイヤ設計
- [主要業務フロー](./docs/flows/) - イベント作成、出欠回答、決済などのプロセス詳細
- [データモデル](./docs/data-model.md) - ER図、テーブル定義、状態遷移
- [セキュリティモデル](./docs/security.md) - 認証・認可 (RLS)、Webhook検証、レート制限
- [ADR (Architecture Decision Records)](./docs/decisions/) - 技術的な意思決定の記録
- [ビジネスルール](./docs/domain.md) - ドメイン知識、計算ロジック、制限事項

## プロジェクト構成

```
event-pay/
├── app/                     # Next.js App Router ページ / ルーティング
│   ├── (auth)/              # 認証関連ページ
│   ├── (dashboard)/         # ダッシュボード
│   ├── (marketing)/         # ランディング
│   ├── (public)/            # 公開ページ
│   └── api/                 # API Routes & Webhooks
├── features/                # 機能モジュール（ドメイン）
├── core/                    # 共有ユーティリティ（auth/logging/security等）
├── components/              # UIコンポーネント
├── supabase/                # migrations
├── tests/                   # unit / e2e
├── emails/                  # メールテンプレート
└── wrangler.jsonc           # Cloudflare Workers 設定
```

## Quick Start（ローカル起動）

前提:
- Node.js 20+
- npm 10+
- Supabase CLI（ローカルDB）
- Stripe CLI（Webhook転送が必要な場合）

手順:
```
git clone https://github.com/rytkhs/event-pay.git
cd event-pay
npm install

cp .env.example .env.local
# .env.local を編集（最低限 Supabase / Stripe / App URL）

supabase start
npm run db:reset
npm run db:migrate

npm run dev
# http://localhost:3000
```

## 開発コマンド

```
# 開発サーバー
npm run dev

# Lint / Format / Typecheck
npm run lint
npm run lint:fix
npm run typecheck
npm run format
npm run format:check
npm run check:all
```

Stripe Webhook（必要時）:
```
npm run stripe:listen
```

メールテンプレート（必要時）:
```
npm run email:dev
```

## テスト

ユニットテスト（Jest）:
```
npm run test:unit
npm run test:unit:watch
npm run test:unit:coverage
```

E2E（Playwright）:
```
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
```

## デプロイ（Cloudflare Workers）

このプロジェクトは Cloudflare Workers 上に OpenNext を用いてデプロイする構成です。
本番環境は `minnano-shukin.com` ドメインで動作します。

前提:
1. Cloudflare R2 バケット `cache` を作成
2. `wrangler` でログイン
3. 本番用の環境変数を Cloudflare 側に設定

コマンド:
```
# プレビューデプロイ
npm run preview

# 本番デプロイ
npm run deploy

# アセットのみアップロード
npm run upload

# Cloudflare型生成
npm run cf-typegen
```

## 環境変数

必須:

### Supabase
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Stripe
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_CONNECT_WEBHOOK_SECRET=
```

### App
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
