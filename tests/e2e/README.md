# E2Eテスト

このディレクトリには、Playwrightを使用したE2Eテストが含まれています。

## 前提条件

### 1. 基本的な環境

- Node.js 18以上
- ローカルのSupabaseが起動していること
- `.env.test` ファイルが正しく設定されていること

### 2. Stripe CLI（決済テスト用）

Stripe決済フローのテスト（`stripe-payment-full-flow.spec.ts`）を実行する場合、Stripe CLIが必要です。

#### Stripe CLIのインストール

**macOS (Homebrew):**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux (Debian/Ubuntu):**
```bash
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
sudo apt update
sudo apt install stripe
```

**Windows:**
```powershell
scoop install stripe
```

その他のインストール方法: https://docs.stripe.com/stripe-cli#install

#### Stripe CLIのセットアップ

1. **ログイン:**
```bash
stripe login
```

ブラウザが開き、Stripeアカウントへのアクセスを許可します。

2. **Webhookリスナーの起動（テスト実行前に必須）:**
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

このコマンドは、Stripeからのwebhookイベントをローカルサーバーに転送します。
テスト実行中は、このプロセスを別ターミナルで起動したままにしてください。

3. **Webhook Secret の設定:**

`stripe listen` コマンドを実行すると、Webhook Signing Secretが表示されます：
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

このシークレットを `.env.test` に設定します：
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

## 環境変数の設定

`.env.test` ファイルに以下の環境変数を設定してください：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx  # stripe listenで取得

# テスト設定
SKIP_QSTASH_IN_TEST=true  # Webhookを同期処理にする
```

## テストの実行

### すべてのE2Eテストを実行

```bash
npm run test:e2e
# または
pnpm test:e2e
```

### 特定のテストファイルを実行

```bash
npx playwright test stripe-payment-full-flow.spec.ts
```

### UIモードで実行（デバッグ用）

```bash
npx playwright test --ui
```

### ヘッドフルモードで実行（ブラウザを表示）

```bash
npx playwright test --headed
```

## Stripe決済テストの実行手順

1. **Stripe CLIのWebhookリスナーを起動:**
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

2. **別ターミナルでローカルサーバーを起動:**
```bash
npm run dev
```

3. **別ターミナルでSupabaseを起動:**
```bash
supabase start
```

4. **E2Eテストを実行:**
```bash
npx playwright test stripe-payment-full-flow.spec.ts
```

## テストアーキテクチャ

### Stripe決済テストのアプローチ

`stripe-payment-full-flow.spec.ts` は、Stripe公式のベストプラクティスに従っています：

#### 1. Checkout UIの操作を避ける
Stripeの公式ドキュメントによると：
> "Frontend interfaces, like Stripe Checkout, have security measures in place that prevent automated testing"

そのため、実際のCheckoutページでのカード入力操作は行いません。

#### 2. Stripe CLIでWebhookイベントをトリガー
手動でイベントオブジェクトを構築する代わりに、Stripe CLIの `trigger` コマンドを使用します。
これにより、本物のイベント構造を保証し、テストの信頼性が向上します。

#### 3. PaymentIntentをAPI経由で作成・確認
実際の決済フローをシミュレートしながら、Checkout UIの操作を回避します。

### ヘルパー関数

`helpers/payment-helpers.ts` には、決済テスト用のヘルパー関数が含まれています：

- `triggerStripeWebhookEvent()` - Stripe CLIでWebhookイベントをトリガー
- `completeCheckoutSessionViaWebhook()` - PaymentIntentを作成し、Webhookをトリガー
- `waitForPaymentStatus()` - 決済ステータスの変更を待機
- `getPaymentFromDB()` - DBから決済情報を取得
- `cleanupTestData()` - テストデータのクリーンアップ

## トラブルシューティング

### Stripe CLIが見つからない

```
Error: Failed to trigger payment_intent.succeeded via Stripe CLI: Error: Command failed: stripe trigger payment_intent.succeeded
/bin/sh: stripe: command not found
```

**解決策:** Stripe CLIをインストールし、PATHに追加してください。

### Webhook Secretが無効

```
Error: Webhook Error: No signatures found matching the expected signature for payload
```

**解決策:**
1. `stripe listen` コマンドで新しいWebhook Secretを取得
2. `.env.test` の `STRIPE_WEBHOOK_SECRET` を更新
3. アプリケーションを再起動

### Webhookリスナーが起動していない

```
Error: checkout.session.completed webhook failed: 500 Internal Server Error
```

**解決策:**
別ターミナルで `stripe listen --forward-to localhost:3000/api/webhooks/stripe` を実行してください。

## 参考資料

- [Stripe公式: Automated Testing](https://docs.stripe.com/automated-testing)
- [Stripe CLI ドキュメント](https://docs.stripe.com/stripe-cli)
- [Stripe Webhooks テスト](https://docs.stripe.com/webhooks#test-webhook)
- [Playwright ドキュメント](https://playwright.dev/)
