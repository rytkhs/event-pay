# テスト基盤セットアップ

EventPayのテスト用の基盤設定、共通セットアップ関数、モック戦略について説明します。

## 概要

この基盤は以下のベストプラクティスに従って設計されています：

1. **テストモード使用**: 実際の課金を発生させない
2. **モック戦略**: API境界でのモック化による高速テスト
3. **署名検証**: Webhook署名検証の適切なテスト
4. **環境分離**: テスト専用の環境変数設定
5. **コード重複削減**: 共通セットアップ関数による重複コードの削減

## ファイル構成

```
tests/setup/
├── jest-setup.ts           # Jest共通セットアップ
├── common-test-setup.ts     # 共通テストセットアップ関数
├── common-mocks.ts          # 統一モック設定関数
├── stripe-mock.ts           # Stripeモックデータとクライアント
├── stripe-test-helpers.ts   # テストヘルパー関数
└── README.md               # このファイル
```

## 使用方法

### 1. 共通テストセットアップ関数の使用

テストコードの重複を削減するため、共通セットアップ関数を使用することを推奨します。

#### 1.1 基本的なセットアップ

```typescript
import { createCommonTestSetup } from "@tests/setup/common-test-setup";

describe("イベント作成テスト", () => {
  let setup: CommonTestSetup;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `event-creation-test-${Date.now()}`,
      withConnect: false,
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  it("イベントを作成できる", async () => {
    // setup.testUser と setup.adminClient を使用
    const event = await createEvent(setup.testUser.id, {
      title: "テストイベント",
    });
    expect(event).toBeDefined();
  });
});
```

#### 1.2 決済テスト用のセットアップ

```typescript
import { createPaymentTestSetup } from "@tests/setup/common-test-setup";

describe("決済テスト", () => {
  let setup: PaymentTestSetup;

  beforeAll(async () => {
    setup = await createPaymentTestSetup({
      testName: `payment-test-${Date.now()}`,
      eventFee: 1500,
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  it("決済を処理できる", async () => {
    // setup.testUser, setup.testEvent, setup.testAttendance を使用
    const payment = await processPayment({
      eventId: setup.testEvent.id,
      attendanceId: setup.testAttendance.id,
    });
    expect(payment).toBeDefined();
  });
});
```

#### 1.3 Webhookテスト用のセットアップ

```typescript
import { createWebhookTestSetup } from "@tests/setup/common-test-setup";

describe("Webhookテスト", () => {
  let setup: WebhookTestSetup;

  beforeAll(async () => {
    setup = await createWebhookTestSetup({
      testName: `webhook-test-${Date.now()}`,
      eventFee: 1500,
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  it("Webhookイベントを処理できる", async () => {
    // setup.testUser, setup.testEvent, setup.testAttendance を使用
    const event = createWebhookEvent("payment_intent.succeeded");
    await handleWebhook(event);
  });
});
```

#### 1.4 セットアップオプション

##### CommonTestSetupOptions

```typescript
interface CommonTestSetupOptions {
  withConnect?: boolean;        // Connect設定済みユーザーを作成するか
  withEvent?: boolean;           // 有料イベントを作成するか
  withAttendance?: boolean;      // 参加登録を作成するか（withEventがtrueの場合のみ有効）
  testName?: string;              // テスト名（メールアドレスやイベントタイトルの生成に使用）
  eventFee?: number;             // イベントの料金（withEventがtrueの場合）
  paymentMethods?: PaymentMethod[]; // 決済方法（withEventがtrueの場合）
  accessedTables?: string[];     // アクセスするテーブルリスト（adminClient作成時に使用）
  withAdminClient?: boolean;      // adminClientを作成するか（デフォルト: true）
  customUserOptions?: {           // ユーザー作成時の追加オプション
    // createTestUserWithConnect用
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
    stripeAccountId?: string;
    // createTestUser用
    maxRetries?: number;
    retryDelay?: number;
    skipProfileCreation?: boolean;
  };
  skipCleanup?: boolean;          // クリーンアップをスキップするか（デフォルト: false）
}
```

##### PaymentTestSetupOptions

```typescript
interface PaymentTestSetupOptions extends CommonTestSetupOptions {
  withFeeConfig?: boolean;        // fee_configのセットアップを含めるか（デフォルト: false）
  customStripeAccountOptions?: {  // Stripe Connectアカウントの追加オプション
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
    stripeAccountId?: string;
  };
}
```

##### 使用例

```typescript
// adminClientを作成しない場合
const setup = await createCommonTestSetup({
  testName: `test-${Date.now()}`,
  withAdminClient: false,
});

// カスタムユーザーオプションを使用
const setup = await createCommonTestSetup({
  testName: `test-${Date.now()}`,
  withConnect: true,
  customUserOptions: {
    payoutsEnabled: false,
    chargesEnabled: true,
    stripeAccountId: "acct_custom_123",
  },
});

// fee_configを含む決済テストセットアップ
const setup = await createPaymentTestSetup({
  testName: `payment-test-${Date.now()}`,
  eventFee: 1500,
  withFeeConfig: true,
  customStripeAccountOptions: {
    payoutsEnabled: true,
    chargesEnabled: true,
  },
});
```

#### 1.5 複数ユーザーテスト用のセットアップ

```typescript
import { createMultiUserTestSetup } from "@tests/setup/common-test-setup";

describe("複数ユーザーテスト", () => {
  let setup: MultiUserTestSetup;

  beforeAll(async () => {
    setup = await createMultiUserTestSetup({
      testName: `multi-user-test-${Date.now()}`,
      userCount: 3,
      withConnect: [true, false, true], // 1番目と3番目はConnect設定済み
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  it("複数ユーザーでテストできる", async () => {
    const user1 = setup.users[0];
    const user2 = setup.users[1];
    const user3 = setup.users[2];
    // テスト実装...
  });
});
```

### 2. 統一モック設定の使用

テストでよく使われるモック設定を共通化しています。

#### 2.1 認証モック

```typescript
import { setupAuthMocks } from "@tests/setup/common-mocks";

describe("認証が必要なテスト", () => {
  let setup: CommonTestSetup;
  let mockGetCurrentUser: jest.MockedFunction<typeof getCurrentUser>;

  beforeAll(async () => {
    setup = await createCommonTestSetup();
    mockGetCurrentUser = setupAuthMocks(setup.testUser);
  });

  beforeEach(() => {
    // 各テスト前に認証モックを再設定
    mockGetCurrentUser.mockResolvedValue({
      id: setup.testUser.id,
      email: setup.testUser.email,
      user_metadata: {},
      app_metadata: {},
    } as any);
  });

  afterEach(() => {
    mockGetCurrentUser.mockReset();
  });
});
```

#### 2.2 ロガーモック

```typescript
import { setupLoggerMocks } from "@tests/setup/common-mocks";

// モック化が必要（jest-setup.tsで既にモック化されている場合は不要）
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("ログ出力をテストする", () => {
  let mockLogger: jest.Mocked<typeof logger>;

  beforeAll(() => {
    mockLogger = setupLoggerMocks();
  });

  it("ログが出力される", () => {
    logger.info("テストメッセージ");
    expect(mockLogger.info).toHaveBeenCalledWith("テストメッセージ");
  });
});
```

#### 2.3 レート制限モック

```typescript
import { setupRateLimitMocks } from "@tests/setup/common-mocks";

// モック化が必要
jest.mock("@core/rate-limit", () => ({
  enforceRateLimit: jest.fn(),
  withRateLimit: jest.fn(),
}));

describe("レート制限をテストする", () => {
  let mocks: ReturnType<typeof setupRateLimitMocks>;

  beforeAll(() => {
    // デフォルトでレート制限を通す
    mocks = setupRateLimitMocks(true);
  });

  it("レート制限を通過できる", async () => {
    const result = await enforceRateLimit("test-key");
    expect(result.allowed).toBe(true);
  });

  it("レート制限をブロックする", async () => {
    mocks.mockEnforceRateLimit.mockResolvedValue({ allowed: false });
    const result = await enforceRateLimit("test-key");
    expect(result.allowed).toBe(false);
  });
});
```

#### 2.4 共通モックを一括設定

```typescript
import { setupCommonMocks, resetCommonMocks } from "@tests/setup/common-mocks";

describe("複数のモックが必要なテスト", () => {
  let setup: CommonTestSetup;
  let mocks: CommonMocks;

  beforeAll(async () => {
    setup = await createCommonTestSetup();
    mocks = setupCommonMocks(setup.testUser, {
      includeLogger: true,
      includeRateLimit: true,
      includeSecurityLogger: true,
      allowRateLimit: true,
    });
  });

  afterEach(() => {
    resetCommonMocks(mocks);
  });
});
```

### 3. 既存のStripeテスト設定

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

### 4. Webhook テスト

```typescript
import { createTestWebhookEvent, generateTestWebhookSignature } from '@/tests/setup/stripe-test-helpers';

it('Webhookイベント処理テスト', async () => {
  const event = createTestWebhookEvent('checkout.session.completed');
  const signature = generateTestWebhookSignature(JSON.stringify(event));

  // Webhookハンドラーのテスト...
});
```

### 5. Connect アカウントテスト

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

## ベストプラクティス

### 1. 新しいテストを追加する際の手順

1. **共通セットアップ関数を使用する**
   - 基本的なテスト: `createCommonTestSetup`
   - 決済テスト: `createPaymentTestSetup`
   - Webhookテスト: `createWebhookTestSetup`

2. **特殊な要件がある場合**
   - 共通関数のオプションで対応できない場合は、専用のセットアップファイルを作成
   - ただし、可能な限り共通関数を活用する

3. **モック設定**
   - 認証モック: `setupAuthMocks`
   - ロガーモック: `setupLoggerMocks`
   - レート制限モック: `setupRateLimitMocks`
   - 複数のモックが必要な場合: `setupCommonMocks`

### 2. テストセットアップのパターン

#### パターン1: シンプルな統合テスト

```typescript
import { createCommonTestSetup } from "@tests/setup/common-test-setup";
import { setupAuthMocks } from "@tests/setup/common-mocks";

describe("シンプルなテスト", () => {
  let setup: CommonTestSetup;
  let mockGetCurrentUser: jest.MockedFunction<typeof getCurrentUser>;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `simple-test-${Date.now()}`,
    });
    mockGetCurrentUser = setupAuthMocks(setup.testUser);
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue({
      id: setup.testUser.id,
      email: setup.testUser.email,
    } as any);
  });

  afterEach(() => {
    mockGetCurrentUser.mockReset();
  });

  it("テストケース", async () => {
    // テスト実装
  });
});
```

#### パターン2: 決済テスト

```typescript
import { createPaymentTestSetup } from "@tests/setup/common-test-setup";

describe("決済テスト", () => {
  let setup: PaymentTestSetup;

  beforeAll(async () => {
    setup = await createPaymentTestSetup({
      testName: `payment-test-${Date.now()}`,
      eventFee: 1500,
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  it("決済を処理できる", async () => {
    // setup.testUser, setup.testEvent, setup.testAttendance を使用
  });
});
```

#### パターン3: 専用セットアップファイルを使用する場合

```typescript
// tests/integration/feature/feature-test-setup.ts
import { createCommonTestSetup, type CommonTestSetup } from "@tests/setup/common-test-setup";
import { setupAuthMocks } from "@tests/setup/common-mocks";

export interface FeatureTestSetup extends CommonTestSetup {
  // 追加のプロパティ
  mockGetCurrentUser: jest.MockedFunction<typeof getCurrentUser>;
}

export async function setupFeatureTest(): Promise<FeatureTestSetup> {
  // 共通セットアップを使用
  const commonSetup = await createCommonTestSetup({
    testName: `feature-test-${Date.now()}`,
    withConnect: false,
  });

  // 追加のモック設定
  const mockGetCurrentUser = setupAuthMocks(commonSetup.testUser);

  return {
    ...commonSetup,
    mockGetCurrentUser,
  };
}
```

### 3. モックのリセット

- **各テスト後**: `mockReset()` を使用してモックをリセット
- **各テスト前**: 必要に応じてモックの値を再設定
- **共通モック**: `resetCommonMocks()` を使用して一括リセット

### 4. クリーンアップ

- **必ず `afterAll` でクリーンアップを実行**: `await setup.cleanup()`
- **エラーが発生してもクリーンアップを実行**: `try-finally` を使用
- **複数のリソースを作成した場合**: すべてをクリーンアップする

```typescript
afterAll(async () => {
  try {
    // 追加で作成したリソースのクリーンアップ
    for (const resourceId of createdResourceIds) {
      await cleanupResource(resourceId);
    }
  } finally {
    // 共通セットアップのクリーンアップ
    await setup.cleanup();
  }
});
```

## 注意事項

1. **本番環境との分離**: テスト用のAPIキーのみ使用
2. **データクリーンアップ**: 各テスト後にモックをリセット、`afterAll`でデータをクリーンアップ
3. **エラーハンドリング**: Stripe APIエラーの適切な模倣
4. **署名検証**: Webhook署名の検証ロジックをテスト
5. **共通関数の使用**: 新しいテストを追加する際は、可能な限り共通セットアップ関数を使用する
6. **モックの順序**: モックを設定する前に、`jest.mock()`でモジュールをモック化する必要がある

## トラブルシューティング

### よくある問題

1. **TypeScriptエラー**: Stripe型定義の不整合
   - 解決: モックデータの型キャストを適切に実行

2. **環境変数未設定**: テスト用環境変数の不足
   - 解決: `.env.test`の設定を確認

3. **モックリセット忘れ**: テスト間でのモック状態継続
   - 解決: `afterEach`でのモッククリアを確認

4. **モックが動作しない**: `jest.mock()`が実行されていない
   - 解決: モック設定関数を呼び出す前に、`jest.mock()`でモジュールをモック化する
   - 例: `jest.mock("@core/logging/app-logger")` を `setupLoggerMocks()` の前に記述

5. **クリーンアップが実行されない**: テストが失敗した場合にクリーンアップがスキップされる
   - 解決: `try-finally`を使用して、エラーが発生してもクリーンアップを実行する

6. **セットアップが重複している**: 複数のテストファイルで同じセットアップコードを書いている
   - 解決: 共通セットアップ関数を使用する、または専用のセットアップファイルを作成する

7. **adminClientが取得できない**: `SecureSupabaseClientFactory`のエラー
   - 解決: `.env.test`のSupabase設定を確認する
   - 解決: `accessedTables`オプションで必要なテーブルを指定する

8. **テストユーザーが作成できない**: メールアドレスの重複
   - 解決: `testName`オプションに一意な値（例: `Date.now()`）を使用する

## 実装例

### 実装例1: イベント作成テスト

```typescript
// tests/integration/events/event-creation-test-setup.ts
import { createCommonTestSetup, type CommonTestSetup } from "@tests/setup/common-test-setup";

export async function setupEventCreationTest(): Promise<CommonTestSetup> {
  return await createCommonTestSetup({
    testName: `event-creation-test-${Date.now()}`,
    withConnect: false,
  });
}

export type EventCreationTestSetup = CommonTestSetup;
```

```typescript
// tests/integration/events/event-creation.integration.test.ts
import { setupEventCreationTest, type EventCreationTestSetup } from "./event-creation-test-setup";
import { getCurrentUser } from "@core/auth/auth-utils";

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;

describe("イベント作成統合テスト", () => {
  let setup: EventCreationTestSetup;

  beforeAll(async () => {
    setup = await setupEventCreationTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue({
      id: setup.testUser.id,
      email: setup.testUser.email,
    } as any);
  });

  afterEach(() => {
    mockGetCurrentUser.mockReset();
  });

  it("イベントを作成できる", async () => {
    // テスト実装
  });
});
```

### 実装例2: ダッシュボード統計テスト（モック設定を含む）

```typescript
// tests/integration/dashboard/dashboard-stats-test-setup.ts
import { createCommonTestSetup, type CommonTestSetup } from "@tests/setup/common-test-setup";
import { setupAuthMocks } from "@tests/setup/common-mocks";
import { getCurrentUser } from "@core/auth/auth-utils";
import { createClient } from "@core/supabase/server";

jest.mock("@core/supabase/server", () => ({
  createClient: jest.fn(),
}));

export interface DashboardStatsTestSetup extends CommonTestSetup {
  mockGetCurrentUser: jest.MockedFunction<typeof getCurrentUser>;
  mockCreateClient: jest.MockedFunction<typeof createClient>;
}

export async function setupDashboardStatsTest(): Promise<DashboardStatsTestSetup> {
  const commonSetup = await createCommonTestSetup({
    testName: `dashboard-stats-test-${Date.now()}`,
    withConnect: false,
  });

  const mockGetCurrentUser = setupAuthMocks(commonSetup.testUser);

  return {
    ...commonSetup,
    mockGetCurrentUser,
    mockCreateClient: createClient as jest.MockedFunction<typeof createClient>,
  };
}
```

### 実装例3: Webhookテスト

```typescript
// tests/integration/payments/webhook/payment-intent-succeeded/payment-intent-succeeded-test-setup.ts
import { createWebhookTestSetup } from "@tests/setup/common-test-setup";
import { setupLoggerMocks } from "@tests/setup/common-mocks";

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

export async function setupPaymentIntentSucceededTest() {
  setupLoggerMocks();

  const webhookSetup = await createWebhookTestSetup({
    testName: `payment-intent-succeeded-test-${Date.now()}`,
    eventFee: 1500,
  });

  return {
    ...webhookSetup,
    // 追加のヘルパー関数など
  };
}
```

## 参考資料

- [Stripe Testing Documentation](https://docs.stripe.com/testing)
- [Jest Mocking Guide](https://jestjs.io/docs/mock-functions)
- [EventPay テスト要件定義](../../docs/spec/TEST/required.md)
- [共通セットアップ関数の実装](../setup/common-test-setup.ts)
- [統一モック設定の実装](../setup/common-mocks.ts)
