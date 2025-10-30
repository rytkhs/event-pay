# みんなの集金 (EventPay)

小規模コミュニティ向けのイベント出欠管理・集金ツール。
会計担当者の負担を大幅に削減することを目標に、Next.js 14 App Router と Supabase、Stripe、Cloudflare Workers を組み合わせて構築しています。

## 技術スタック
- Framework: Next.js 14 (App Router + Server Actions)
- BaaS: Supabase (@supabase/ssr, supabase-js)
- Payment: Stripe (Connect Express)
- UI: Tailwind CSS + shadcn/ui (@radix-ui/*)
- フォーム: React Hook Form + Zod
- セキュリティ: @upstash/ratelimit
- タイムゾーン: date-fns + date-fns-tz
- サニタイゼーション: sanitize-html（エディタ用）
- ロギング: pino (+ pino-pretty)
- テスト: Jest + Playwright + Testing Library
- Hosting/Runtime: Cloudflare Workers via OpenNext (@opennextjs/cloudflare)

## 必要要件
- Node.js 20 以上
- npm 10 以上
- Supabase CLI（DB ローカル操作用）
- Stripe CLI（Webhook 転送用）
- Cloudflare Wrangler（デプロイ・型生成）

## セットアップ
1. 依存関係のインストール
   ```bash
   npm install
   ```
2. 環境変数
   - `.env.example` を `.env.local` にコピーして値を設定
   ```bash
   cp .env.example .env.local
   ```
   - 主要項目（抜粋）
     - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
     - STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
     - STRIPE_CONNECT_WEBHOOK_SECRET
     - NEXT_PUBLIC_APP_URL, NEXTAUTH_URL
     - UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, RL_HMAC_SECRET
     - RESEND_API_KEY, FROM_EMAIL, ADMIN_EMAIL
3. Supabase（任意: ローカル DB を使う場合）
   ```bash
   npm run db:reset     # DB リセット
   npm run db:migrate   # マイグレーション適用
   npm run db:seed      # シード投入
   ```

## 開発
- アプリ起動
  ```bash
  npm run dev
  ```
  - Next.js をローカルで起動し、ログを pino-pretty で整形表示します。
- Stripe Webhook 転送
  ```bash
  npm run stripe:listen
  ```
  - `http://localhost:3000/api/webhooks/stripe` と `.../stripe-connect` に転送。

## テスト
- ユニットテスト
  ```bash
  npm run test:unit
  # 監視モード
  npm run test:unit:watch
  # カバレッジ
  npm run test:unit:coverage
  ```
- E2E テスト（Playwright）
  ```bash
  npm run test:e2e
  # 画面表示つき
  npm run test:e2e:headed
  # デバッグ
  npm run test:e2e:debug
  ```
- まとめ実行
  ```bash
  npm run test
  ```
- テスト前準備（DB リセット）
  ```bash
  npm run test:setup
  ```
- E2E とサーバ同時起動
  ```bash
  npm run test:with-server
  ```

## Cloudflare Workers へのデプロイ（OpenNext）
- プレビュー
  ```bash
  npm run preview
  ```
- 本番デプロイ
  ```bash
  npm run deploy
  ```
- アセットのみアップロード（必要時）
  ```bash
  npm run upload
  ```
- 型生成（Wrangler）
  ```bash
  npm run cf-typegen
  ```
- 設定ファイル
  - `open-next.config.ts`: R2 インクリメンタルキャッシュを有効化
  - `wrangler.jsonc`: `.open-next/worker.js` をエントリポイントとして設定。`NEXT_INC_CACHE_R2_BUCKET` を事前に作成してください。

## 定期実行タスク（GitHub Actions）

定期実行タスクはGitHub Actionsで管理されています。

### 設定済みワークフロー
- **Send Reminders**: 毎日 UTC 0:00 (JST 9:00) に実行
- **Monitor Platform Balance**: 毎日 UTC 9:00 (JST 18:00) に実行

### GitHub Secrets設定
リポジトリの Settings > Secrets and variables > Actions で以下を設定：

- `APP_URL`: `https://minnano-shukin.com`
- `CRON_SECRET`: 既存の`CRON_SECRET`環境変数の値

### 手動実行
各ワークフローは独立しており、GitHub Actionsの「Actions」タブから個別に手動実行も可能です。

## セキュリティとヘッダー
- `next.config.mjs` で推奨セキュリティヘッダー（CSP, HSTS, Permissions-Policy など）を付与。
