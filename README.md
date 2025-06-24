# EventPay - イベント参加費用管理システム

EventPay は、Next.js、TypeScript、Supabase、Stripe を使用して構築されたイベント参加費用管理システムです。

## 開発環境のセットアップ

### 前提条件

以下のツールがインストールされている必要があります：

- Node.js v22.15.0 以上（推奨：nvm 使用）
- npm または yarn
- Git
- Supabase CLI
- Stripe CLI（Stripe 連携をテストする場合）

### セットアップ手順

1. **リポジトリのクローン**

   ```bash
   git clone <repository-url>
   cd event-pay
   ```

2. **Node.js のバージョン設定（nvm を使用する場合）**

   ```bash
   nvm install
   nvm use
   ```

3. **依存関係のインストール**

   ```bash
   npm install
   ```

4. **環境変数の設定**

   ```bash
   cp .env.example .env.local
   ```

   `.env.local`ファイルを編集し、必要な環境変数を設定してください。

5. **Supabase のセットアップ**

   ```bash
   # Supabase CLIのインストール（まだの場合）
   # 推奨: devDependencyとしてインストール
   npm install supabase --save-dev

   # Supabaseローカル環境の起動
   npx supabase start

   # データベースのマイグレーション実行
   npm run db:migrate

   # シードデータの投入（必要な場合）
   npm run db:seed
   ```

6. **開発サーバーの起動**

   ```bash
   npm run dev
   ```

   [http://localhost:3000](http://localhost:3000) でアプリケーションにアクセスできます。

## 利用可能なスクリプト

- `npm run dev` - 開発サーバーの起動
- `npm run build` - プロダクションビルドの作成
- `npm run start` - プロダクションサーバーの起動
- `npm run lint` - ESLint の実行
- `npm run typecheck` - TypeScript の型チェック
- `npm run test` - テストの実行
- `npm run test:watch` - テストの監視モード
- `npm run test:coverage` - カバレッジレポート付きテスト
- `npm run test:security` - セキュリティテストの実行
- `npm run db:reset` - データベースのリセット
- `npm run db:migrate` - マイグレーションの実行
- `npm run db:seed` - シードデータの投入
- `npm run stripe:listen` - Stripe Webhook のローカルリスナー起動

## プロジェクト構成

```
event-pay/
├── app/                # Next.js App Routerディレクトリ
├── lib/                # ユーティリティとクライアント設定
│   ├── stripe/         # Stripe関連の設定
│   └── supabase/       # Supabase関連の設定
├── types/              # TypeScript型定義
├── __tests__/          # テストファイル
├── supabase/           # Supabaseマイグレーションとシード
└── docs/               # ドキュメント
```

## 環境変数

以下の環境変数を`.env.local`に設定する必要があります：

### Supabase 設定

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase プロジェクトの URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase の匿名キー
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase のサービスロールキー

### Stripe 設定

- `STRIPE_SECRET_KEY` - Stripe のシークレットキー SK
- `STRIPE_WEBHOOK_SECRET` - Stripe Webhook シークレット
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe の公開可能キー

### アプリケーション設定

- `NEXT_PUBLIC_APP_URL` - アプリケーションの URL（デフォルト：http://localhost:3000）

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
