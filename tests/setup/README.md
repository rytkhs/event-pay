# 決済テスト基盤セットアップ

EventPayの決済機能テスト用の基盤設定とモック戦略について説明します。

## 概要

この基盤は以下のStripeテストベストプラクティスに従って設計されています：

1. **テストモード使用**: 実際の課金を発生させない
2. **モック戦略**: API境界でのモック化による高速テスト
3. **署名検証**: Webhook署名検証の適切なテスト
4. **環境分離**: テスト専用の環境変数設定

## ファイル構成

```
tests/setup/
├── jest-setup.ts           # Jest共通セットアップ
├── stripe-mock.ts           # Stripeモックデータとクライアント
├── stripe-test-helpers.ts   # テストヘルパー関数
└── README.md               # このファイル
```

## 使用方法

### 1. 基本的なテスト設定

```typescript
import { createMockStripeClient, mockCheckoutSession } from '@/tests/setup/stripe-mock';

describe('決済テスト', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Checkout Session作成テスト', async () => {
    const mockStripe = createMockStripeClient();
    // テスト実装...
  });
});
```

### 2. Webhook テスト

```typescript
import { createTestWebhookEvent, generateTestWebhookSignature } from '@/tests/setup/stripe-test-helpers';

it('Webhookイベント処理テスト', async () => {
  const event = createTestWebhookEvent('checkout.session.completed');
  const signature = generateTestWebhookSignature(JSON.stringify(event));

  // Webhookハンドラーのテスト...
});
```

### 3. Connect アカウントテスト

```typescript
import { testStripeAccounts, createMockConnectAccount } from '@/tests/setup/stripe-mock';

it('Connect未設定エラーテスト', async () => {
  const account = createMockConnectAccount({
    payouts_enabled: false
  });

  // エラーハンドリングのテスト...
});
```

## 環境変数設定

テスト実行時は `.env.test` の設定が使用されます：

```bash
# Stripe テストモード
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CONNECT_WEBHOOK_SECRET_TEST=whsec_test_...

# セキュリティ設定（テスト時は緩和）
ENABLE_STRIPE_IP_CHECK=false
```

## モック戦略

### API/準統合テスト
- Stripe SDK呼び出しをモジュールレベルでモック
- パラメータの詳細検証が可能
- 高速実行

### E2Eテスト
- 実際のStripe TestモードAPIを使用
- UIフローの統合検証
- より現実的なテスト環境

## テスト実行コマンド

```bash
# 決済関連テストのみ実行
npm run test:payments

# 全単体テスト実行
npm run test:unit

# カバレッジ付きテスト実行
npm run test:unit:coverage
```

## カバレッジ設定

カバレッジは最大50%に制限されており、重要パスに集中：

- Server Actions（決済関連）
- Webhook ハンドラー
- 認証ガード
- 決済サービスロジック

## 注意事項

1. **本番環境との分離**: テスト用のAPIキーのみ使用
2. **データクリーンアップ**: 各テスト後にモックをリセット
3. **エラーハンドリング**: Stripe APIエラーの適切な模倣
4. **署名検証**: Webhook署名の検証ロジックをテスト

## トラブルシューティング

### よくある問題

1. **TypeScriptエラー**: Stripe型定義の不整合
   - 解決: モックデータの型キャストを適切に実行

2. **環境変数未設定**: テスト用環境変数の不足
   - 解決: `.env.test`の設定を確認

3. **モックリセット忘れ**: テスト間でのモック状態継続
   - 解決: `afterEach`でのモッククリアを確認

## 参考資料

- [Stripe Testing Documentation](https://docs.stripe.com/testing)
- [Jest Mocking Guide](https://jestjs.io/docs/mock-functions)
- [EventPay テスト要件定義](../../docs/spec/TEST/required.md)
