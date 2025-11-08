# テストパターンガイドライン

このドキュメントは、event-payプロジェクトのテストコードを書く際のベストプラクティスとガイドラインをまとめたものです。

## ⚠️ 重要: 新規テストの標準化

**新規テストを作成する際は、必ず共通セットアップ関数を使用してください。**

### 必須事項

1. **共通関数の使用**: 新規テストは必ず以下の共通関数を使用すること
   - `createCommonTestSetup`: 基本的なテストセットアップ
   - `createPaymentTestSetup`: 決済テスト用のセットアップ
   - `createWebhookTestSetup`: Webhookテスト用のセットアップ
   - `createMultiUserTestSetup`: 複数ユーザーテスト用のセットアップ

2. **個別セットアップの禁止**: `createTestUserWithConnect`や`createPaidTestEvent`を直接呼び出すことは避け、共通関数を使用すること

3. **例外ケース**: 以下の場合のみ、個別セットアップを許可
   - 統合テスト用の特別なStripe Connectアカウント設定が必要な場合（例: `guest-session-creation-test-setup.ts`）
   - 動的シナリオ機能が必要な場合（例: `stripe-webhook-worker-test-setup.ts`）
   - その他、共通関数では対応できない特殊な要件がある場合

4. **専用セットアップファイル**: 専用セットアップファイル（`*-test-setup.ts`）を作成する場合でも、可能な限り共通関数を活用すること

### 既存テストの移行

既存テストを移行する際は、以下の優先順位で進めてください：

1. **優先度: 高** - `beforeAll`でセットアップを実装しているテスト
2. **優先度: 中** - 各テストで個別にセットアップを実装しているテスト
3. **優先度: 低** - 専用セットアップファイルを使用しているテスト（共通関数で代替可能な場合）

詳細は[セットアップ・クリーンアップのガイドライン](#セットアップクリーンアップのガイドライン)を参照してください。

## 目次

1. [テスト構造のガイドライン](#テスト構造のガイドライン)
2. [モック設定のガイドライン](#モック設定のガイドライン)
3. [セットアップ・クリーンアップのガイドライン](#セットアップクリーンアップのガイドライン)
4. [アサーションのガイドライン](#アサーションのガイドライン)
5. [コード例](#コード例)

## テスト構造のガイドライン

### AAAパターン（Arrange-Act-Assert）の使用

テストは以下の3つのセクションに分けて記述します：

1. **Arrange（準備）**: テストに必要なデータやモックを設定
2. **Act（実行）**: テスト対象の関数やメソッドを実行
3. **Assert（検証）**: 結果を検証

```typescript
// ✅ 良い例
test("イベントを作成できる", async () => {
  // Arrange
  const setup = await createCommonTestSetup();
  const eventData = {
    title: "テストイベント",
    date: new Date().toISOString(),
    fee: 1000,
  };

  // Act
  const result = await createEvent(setup.testUser.id, eventData);

  // Assert
  expect(result).toBeDefined();
  expect(result.title).toBe("テストイベント");
});
```

```typescript
// ❌ 悪い例
test("イベントを作成できる", async () => {
  const setup = await createCommonTestSetup();
  const result = await createEvent(setup.testUser.id, {
    title: "テストイベント",
    date: new Date().toISOString(),
    fee: 1000,
  });
  expect(result).toBeDefined();
  expect(result.title).toBe("テストイベント");
});
```

### beforeAll/afterAllとbeforeEach/afterEachの使い分け

- **beforeAll/afterAll**: テストスイート全体で1回だけ実行される処理
  - テストユーザーの作成
  - データベース接続の確立
  - 重い初期化処理

- **beforeEach/afterEach**: 各テストケースの前後で実行される処理
  - モックのリセット
  - テスト間でのデータクリーンアップ
  - テストごとに異なる状態の設定

```typescript
// ✅ 良い例
describe("イベント作成テスト", () => {
  let setup: CommonTestSetup;

  beforeAll(async () => {
    // テストスイート全体で1回だけ実行
    setup = await createCommonTestSetup({
      testName: `event-test-${Date.now()}`,
    });
  });

  afterAll(async () => {
    // テストスイート終了時にクリーンアップ
    await setup.cleanup();
  });

  beforeEach(() => {
    // 各テストの前にモックをリセット
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // 各テストの後にテスト間データをクリーンアップ
    // （必要に応じて）
  });
});
```

### テストの独立性を確保する方法

- 各テストは他のテストに依存しないようにする
- テスト間でデータが残らないようにクリーンアップする
- グローバルな状態を変更しない

```typescript
// ✅ 良い例: 各テストが独立している
describe("イベント作成テスト", () => {
  let setup: CommonTestSetup;

  beforeAll(async () => {
    setup = await createCommonTestSetup();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("イベント1を作成できる", async () => {
    const event1 = await createEvent(setup.testUser.id, { title: "イベント1" });
    expect(event1).toBeDefined();
  });

  test("イベント2を作成できる", async () => {
    const event2 = await createEvent(setup.testUser.id, { title: "イベント2" });
    expect(event2).toBeDefined();
  });
});
```

## モック設定のガイドライン

### 共通モック関数の使用を推奨

可能な限り、`tests/setup/common-mocks.ts`の共通モック関数を使用してください。これにより、モック設定の重複を削減し、テストの保守性を向上させることができます。

#### setupCommonMocksの詳細な使用例

複数のモックを一括で設定する場合に使用します。必要なモックのみを選択的に有効化できます。

```typescript
// ✅ 基本的な使用例: 複数のモックを一括設定
import { setupCommonMocks, resetCommonMocks, type CommonMocks } from "@tests/setup/common-mocks";

describe("統合テスト", () => {
  let setup: CommonTestSetup;
  let mocks: CommonMocks;

  beforeAll(async () => {
    setup = await createCommonTestSetup();
    mocks = setupCommonMocks(setup.testUser, {
      includeLogger: true, // ロガーモックを有効化
      includeRateLimit: true, // レート制限モックを有効化
      includeNextHeaders: true, // Next.js headersモックを有効化
      allowRateLimit: true, // レート制限を許可（デフォルト: true）
    });
  });

  afterEach(() => {
    resetCommonMocks(mocks); // モックをリセット
  });
});
```

```typescript
// ✅ セキュリティログモックを含む場合
describe("セキュリティテスト", () => {
  let setup: CommonTestSetup;
  let mocks: CommonMocks;

  beforeAll(async () => {
    setup = await createCommonTestSetup();
    mocks = setupCommonMocks(setup.testUser, {
      includeSecurityLogger: true, // セキュリティログモックを有効化
      includeLogger: true,
    });
  });

  test("セキュリティイベントが記録される", async () => {
    await performSecurityAction();
    expect(mocks.mockLogSecurityEvent).toHaveBeenCalled();
  });
});
```

```typescript
// ✅ カスタムヘッダーや環境変数を含む場合
describe("環境変数テスト", () => {
  let setup: CommonTestSetup;
  let mocks: CommonMocks;

  beforeAll(async () => {
    setup = await createCommonTestSetup();
    mocks = setupCommonMocks(setup.testUser, {
      includeNextHeaders: true,
      customHeaders: {
        "x-forwarded-for": "192.168.1.1",
        "user-agent": "test-agent",
      },
      includeCloudflareEnv: true,
      customEnv: {
        RL_HMAC_SECRET: "custom-secret",
        ADMIN_EMAIL: "custom-admin@example.com",
      },
      includeIPDetection: true,
      ipAddress: "192.168.1.1",
    });
  });
});
```

#### 個別モック関数の使い分け

特定のモックのみが必要な場合は、個別のモック関数を使用することもできます：

```typescript
// ✅ 認証モックのみが必要な場合
import { setupAuthMocks } from "@tests/setup/common-mocks";

describe("認証テスト", () => {
  let setup: CommonTestSetup;
  let mockGetCurrentUser: ReturnType<typeof setupAuthMocks>;

  beforeAll(async () => {
    setup = await createCommonTestSetup();
    mockGetCurrentUser = setupAuthMocks(setup.testUser);
  });

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue({
      id: setup.testUser.id,
      email: setup.testUser.email,
    } as any);
  });
});
```

```typescript
// ✅ ロガーモックのみが必要な場合
import { setupLoggerMocks } from "@tests/setup/common-mocks";

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("ログテスト", () => {
  let mockLogger: ReturnType<typeof setupLoggerMocks>;

  beforeAll(() => {
    mockLogger = setupLoggerMocks();
  });

  test("ログが記録される", async () => {
    await performAction();
    expect(mockLogger.info).toHaveBeenCalled();
  });
});
```

```typescript
// ✅ レート制限モックのみが必要な場合
import { setupRateLimitMocks } from "@tests/setup/common-mocks";

jest.mock("@core/rate-limit", () => ({
  enforceRateLimit: jest.fn(),
  buildKey: jest.fn(),
}));

describe("レート制限テスト", () => {
  let rateLimitMocks: ReturnType<typeof setupRateLimitMocks>;

  beforeAll(() => {
    rateLimitMocks = setupRateLimitMocks(true, "RL:test:127.0.0.1");
  });

  test("レート制限が機能する", async () => {
    const result = await enforceRateLimit("test-key");
    expect(result.allowed).toBe(true);
  });
});
```

```typescript
// ❌ 悪い例: 各テストで個別にモック設定
describe("テスト", () => {
  beforeEach(() => {
    jest.mock("@core/logging/app-logger", () => ({
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    }));
    // ... 他のモック設定
  });
});
```

### モックのリセット方法

各テスト後にモックをリセットして、テスト間での状態の引き継ぎを防ぎます。

```typescript
// ✅ 良い例
afterEach(() => {
  resetCommonMocks(mocks);
  jest.clearAllMocks();
});
```

### モックの順序

`jest.mock()`はファイルのトップレベルで記述し、モック設定関数を呼び出す前にモジュールをモック化します。

```typescript
// ✅ 良い例
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { setupLoggerMocks } from "@tests/setup/common-mocks";

describe("テスト", () => {
  beforeEach(() => {
    setupLoggerMocks();
  });
});
```

### 個別モック設定から共通関数への置き換え例

#### 認証モックの置き換え

```typescript
// ❌ 置き換え前: 個別にモック設定
import { getCurrentUser } from "@core/auth/auth-utils";

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;

beforeAll(async () => {
  setup = await createCommonTestSetup({ testName: "test" });
});

beforeEach(() => {
  mockGetCurrentUser.mockResolvedValue({
    id: setup.testUser.id,
    email: setup.testUser.email,
  } as any);
});

// ✅ 置き換え後: 共通モック関数を使用
import { setupAuthMocks } from "@tests/setup/common-mocks";

let mockGetCurrentUser: ReturnType<typeof setupAuthMocks>;

beforeAll(async () => {
  setup = await createCommonTestSetup({ testName: "test" });
  // 共通モック関数を使用して認証モックを設定
  mockGetCurrentUser = setupAuthMocks(setup.testUser);
});

beforeEach(() => {
  mockGetCurrentUser.mockResolvedValue({
    id: setup.testUser.id,
    email: setup.testUser.email,
  } as any);
});
```

#### レート制限モックの置き換え

```typescript
// ❌ 置き換え前: 個別にモック設定
jest.mock("@core/rate-limit", () => ({
  enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  buildKey: jest.fn().mockReturnValue("key"),
}));

// ✅ 置き換え後: 共通モック関数を使用
jest.mock("@core/rate-limit", () => {
  const actual = jest.requireActual("@core/rate-limit");
  return {
    ...actual,
    enforceRateLimit: jest.fn(),
    buildKey: jest.fn(),
  };
});

import { setupRateLimitMocks } from "@tests/setup/common-mocks";

beforeAll(() => {
  // 共通モック関数を使用してレート制限を設定
  setupRateLimitMocks(true, "key");
});
```

## セットアップ・クリーンアップのガイドライン

### 共通セットアップ関数の使用を推奨

可能な限り、`tests/setup/common-test-setup.ts`の共通セットアップ関数を使用してください。これにより、コードの重複を削減し、テストの保守性を向上させることができます。

#### 利用可能な共通セットアップ関数

1. **`createCommonTestSetup`**: 基本的なテストセットアップ（テストユーザーとadminClient）
2. **`createPaymentTestSetup`**: 決済テスト用のセットアップ（Connect設定済みユーザー、有料イベント、参加登録）
3. **`createWebhookTestSetup`**: Webhookテスト用のセットアップ（QStash環境変数設定を含む）
4. **`createMultiUserTestSetup`**: 複数ユーザーテスト用のセットアップ

#### createCommonTestSetupの詳細な使用例

基本的なテストセットアップに使用します。テストユーザーとSupabase adminクライアントを作成し、クリーンアップ関数を提供します。

```typescript
// ✅ 基本的な使用例
import { createCommonTestSetup, type CommonTestSetup } from "@tests/setup/common-test-setup";

describe("イベント作成テスト", () => {
  let setup: CommonTestSetup;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `event-test-${Date.now()}`,
      withConnect: false, // Connect設定なしのユーザーを作成
    });
  });

  afterAll(async () => {
    await setup.cleanup(); // ユーザーを削除
  });

  test("イベントを作成できる", async () => {
    const event = await createEvent(setup.testUser.id, {
      title: "テストイベント",
    });
    expect(event).toBeDefined();
  });
});
```

```typescript
// ✅ Connect設定済みユーザーが必要な場合
describe("決済機能テスト", () => {
  let setup: CommonTestSetup;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `payment-test-${Date.now()}`,
      withConnect: true, // Connect設定済みユーザーを作成
      customUserOptions: {
        payoutsEnabled: true,
        chargesEnabled: true,
        stripeAccountId: "acct_test_123",
      },
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });
});
```

```typescript
// ✅ adminClientが不要な場合
describe("単体テスト", () => {
  let setup: CommonTestSetup;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `unit-test-${Date.now()}`,
      withAdminClient: false, // adminClientを作成しない
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });
});
```

#### createPaymentTestSetupの詳細な使用例

決済テストに必要なデータ（Connect設定済みユーザー、有料イベント、参加登録）を一括でセットアップします。

```typescript
// ✅ 基本的な決済テストセットアップ
import { createPaymentTestSetup, type PaymentTestSetup } from "@tests/setup/common-test-setup";

describe("決済処理テスト", () => {
  let setup: PaymentTestSetup;

  beforeAll(async () => {
    setup = await createPaymentTestSetup({
      testName: `payment-test-${Date.now()}`,
      eventFee: 1500, // イベントの料金
      paymentMethods: ["stripe", "cash"], // 決済方法
    });
  });

  afterAll(async () => {
    await setup.cleanup(); // イベント、参加、決済、ユーザーを削除
  });

  test("決済を処理できる", async () => {
    // setup.testUser: Connect設定済みユーザー
    // setup.testEvent: 有料イベント
    // setup.testAttendance: 参加登録
    const payment = await processPayment({
      eventId: setup.testEvent.id,
      attendanceId: setup.testAttendance.id,
    });
    expect(payment).toBeDefined();
  });
});
```

```typescript
// ✅ fee_configを含む決済テストセットアップ
describe("手数料計算テスト", () => {
  let setup: PaymentTestSetup;

  beforeAll(async () => {
    setup = await createPaymentTestSetup({
      testName: `fee-test-${Date.now()}`,
      eventFee: 1500,
      withFeeConfig: true, // fee_configデータをセットアップ
      customStripeAccountOptions: {
        payoutsEnabled: true,
        chargesEnabled: true,
      },
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });
});
```

#### createWebhookTestSetupの詳細な使用例

Webhookテストに必要なデータとQStash環境変数をセットアップします。

```typescript
// ✅ Webhookテストセットアップ
import { createWebhookTestSetup, type WebhookTestSetup } from "@tests/setup/common-test-setup";

describe("Stripe Webhookテスト", () => {
  let setup: WebhookTestSetup;

  beforeAll(async () => {
    setup = await createWebhookTestSetup({
      testName: `webhook-test-${Date.now()}`,
      eventFee: 1500,
      // QStash環境変数は自動的に設定される
      // process.env.QSTASH_CURRENT_SIGNING_KEY
      // process.env.QSTASH_NEXT_SIGNING_KEY
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("Webhookイベントを処理できる", async () => {
    const webhookEvent = createWebhookEvent("payment_intent.succeeded");
    const result = await handleWebhook(webhookEvent);
    expect(result.success).toBe(true);
  });
});
```

#### createMultiUserTestSetupの詳細な使用例

複数のテストユーザーを作成し、認証テストやアクセス制御テストに使用します。

```typescript
// ✅ 複数ユーザーテストセットアップ
import { createMultiUserTestSetup, type MultiUserTestSetup } from "@tests/setup/common-test-setup";

describe("アクセス制御テスト", () => {
  let setup: MultiUserTestSetup;

  beforeAll(async () => {
    setup = await createMultiUserTestSetup({
      testName: `multi-user-test-${Date.now()}`,
      userCount: 3,
      withConnect: [true, false, true], // 1番目と3番目はConnect設定済み、2番目は未設定
    });
  });

  afterAll(async () => {
    await setup.cleanup(); // すべてのユーザーを削除
  });

  test("ユーザー1がイベントを作成できる", async () => {
    const user1 = setup.users[0];
    const event = await createEvent(user1.id, {
      title: "ユーザー1のイベント",
    });
    expect(event).toBeDefined();
  });

  test("ユーザー2がユーザー1のイベントにアクセスできない", async () => {
    const user1 = setup.users[0];
    const user2 = setup.users[1];
    const event = await createEvent(user1.id, {
      title: "ユーザー1のイベント",
    });

    const result = await getEvent(user2.id, event.id);
    expect(result).toBeNull();
  });
});
```

```typescript
// ✅ 良い例: 共通セットアップ関数を使用
import { createCommonTestSetup } from "@tests/setup/common-test-setup";

describe("テスト", () => {
  let setup: CommonTestSetup;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `test-${Date.now()}`,
      withConnect: false,
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });
});
```

```typescript
// ✅ 良い例: 複数ユーザーテスト
import { createMultiUserTestSetup } from "@tests/setup/common-test-setup";

describe("複数ユーザーテスト", () => {
  let setup: MultiUserTestSetup;

  beforeAll(async () => {
    setup = await createMultiUserTestSetup({
      testName: `multi-user-test-${Date.now()}`,
      userCount: 2,
      withConnect: [true, false], // 1番目はConnect設定済み、2番目は未設定
    });
  });

  afterAll(async () => {
    await setup.cleanup();
  });
});
```

#### 拡張されたオプション

共通セットアップ関数は、様々なユースケースに対応できるよう拡張されています：

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

#### 専用セットアップファイルの使い分けガイドライン

専用セットアップファイル（`*-test-setup.ts`）を作成する前に、まず共通関数で対応できるかどうかを検討してください。

##### 共通関数で対応可能なケース

以下のケースは、共通関数で対応可能です。専用ファイルを作成する必要はありません：

- **基本的なテストユーザーとadminClientが必要な場合**: `createCommonTestSetup`を使用
- **決済テスト（Connect設定済みユーザー、有料イベント、参加登録）が必要な場合**: `createPaymentTestSetup`を使用
- **Webhookテスト（QStash環境変数設定を含む）が必要な場合**: `createWebhookTestSetup`を使用
- **複数ユーザーテストが必要な場合**: `createMultiUserTestSetup`を使用

```typescript
// ✅ 良い例: 共通関数を使用（専用ファイルは不要）
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
});
```

##### 専用ファイルが必要なケース

以下のケースは、専用セットアップファイルを作成することを検討してください：

- **複雑なテストデータのセットアップが必要な場合**: 複数のイベント、参加、決済を特定の状態で作成する必要がある場合
- **特殊なモック設定が必要な場合**: 共通モック関数では対応できない特殊なモック設定が必要な場合
- **テスト固有のヘルパー関数が必要な場合**: テスト専用のヘルパー関数（例: 特定のWebhookイベントを作成する関数）が必要な場合

```typescript
// ✅ 良い例: 専用セットアップファイルを使用（複雑なセットアップが必要な場合）
import { setupPaymentCompletionGuardTest } from "./payment-completion-guard-test-setup";

describe("決済完了ガードテスト", () => {
  let setup: PaymentCompletionGuardTestSetup;

  beforeAll(async () => {
    setup = await setupPaymentCompletionGuardTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });
});
```

##### 専用ファイルでも共通関数を活用する方法

専用セットアップファイルを作成する場合でも、可能な限り共通関数を活用してください：

```typescript
// ✅ 良い例: 専用セットアップファイル内で共通関数を活用
import { createPaymentTestSetup } from "@tests/setup/common-test-setup";
import { setupCommonMocks } from "@tests/setup/common-mocks";

export async function setupCustomTest(): Promise<CustomTestSetup> {
  // 共通関数を使用して基本セットアップを作成
  const paymentSetup = await createPaymentTestSetup({
    testName: `custom-test-${Date.now()}`,
    eventFee: 1500,
  });

  // 共通モック関数を使用
  const mocks = setupCommonMocks(paymentSetup.testUser, {
    includeLogger: true,
    includeRateLimit: true,
  });

  // テスト固有の追加セットアップ
  const customData = await createCustomTestData(paymentSetup.testEvent.id);

  return {
    ...paymentSetup,
    customData,
    mocks,
    cleanup: async () => {
      // カスタムデータのクリーンアップ
      await cleanupCustomData(customData.id);
      // 共通セットアップのクリーンアップ
      await paymentSetup.cleanup();
    },
  };
}
```

```typescript
// ❌ 悪い例: 共通関数を使用せず、すべてを個別に実装
export async function setupCustomTest(): Promise<CustomTestSetup> {
  // 共通関数を使用せず、すべてを個別に実装
  const testUser = await createTestUserWithConnect(
    `custom-test-${Date.now()}@example.com`,
    "TestPassword123!"
  );
  const testEvent = await createPaidTestEvent(testUser.id, {
    title: "Custom Test Event",
    fee: 1500,
  });
  // ... 他の個別実装
}
```

### クリーンアップのタイミング

- **afterAll**: テストスイート全体のクリーンアップ（ユーザー削除など）
- **afterEach**: テスト間でのデータクリーンアップ（イベント、参加、決済の削除など）

### クリーンアップヘルパーの使い分け

クリーンアップには3つの主要なヘルパーがあります。用途に応じて使い分けてください：

#### 1. createTestDataCleanupHelper（テスト間クリーンアップ）

**用途**: テスト間（`afterEach`）でのクリーンアップ
**対象**: イベント、参加、決済のみ（ユーザーは含まない）
**特徴**: 軽量で高速、`adminClient`を直接使用
**ファイル**: `tests/setup/common-test-setup.ts`

各テストで作成したリソースを`afterEach`でクリーンアップする場合に使用します。ユーザーのクリーンアップは含まれないため、`afterAll`で`setup.cleanup()`を呼び出す必要があります。

#### 2. createCleanupTracker（テストスイート全体のクリーンアップ）

**用途**: テストスイート全体（`afterAll`）でのクリーンアップ
**対象**: イベント、参加、決済、ユーザーすべて
**特徴**: 包括的なクリーンアップ、エラーハンドリングが充実
**ファイル**: `tests/setup/common-cleanup.ts`

テストスイート全体で作成したリソースを`afterAll`で一括クリーンアップする場合に使用します。ユーザーのクリーンアップも含まれます。

#### 3. cleanupTestData（簡易クリーンアップ）

**用途**: 特定のリソースIDを指定してクリーンアップ
**対象**: イベント、参加、決済、ユーザー（指定したIDのみ）
**特徴**: シンプルで柔軟、エラーハンドリングが自動
**ファイル**: `tests/setup/common-cleanup.ts`

特定のリソースIDを指定してクリーンアップする場合に使用します。`afterAll`で使用することが多いです。

```typescript
// ✅ 良い例: テスト間クリーンアップ（createTestDataCleanupHelper）
import { createCommonTestSetup, createTestDataCleanupHelper } from "@tests/setup/common-test-setup";
import type { TestDataCleanupHelper } from "@tests/setup/common-test-setup";

describe("イベント作成テスト", () => {
  let setup: CommonTestSetup;
  let cleanupHelper: TestDataCleanupHelper;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `event-test-${Date.now()}`,
    });
    cleanupHelper = createTestDataCleanupHelper(setup.adminClient);
  });

  afterAll(async () => {
    // ユーザーを削除（createTestDataCleanupHelperではユーザーはクリーンアップされない）
    await setup.cleanup();
  });

  afterEach(async () => {
    // テスト間データをクリーンアップ（イベント、参加、決済のみ）
    try {
      await cleanupHelper.cleanup();
      cleanupHelper.reset();
    } catch (error) {
      console.warn("Inter-test cleanup failed:", error);
    }
  });

  test("イベントを作成できる", async () => {
    const event = await createEvent(setup.testUser.id, {
      title: "テストイベント",
    });
    cleanupHelper.trackEvent(event.id); // クリーンアップ対象として追跡
    expect(event).toBeDefined();
  });

  test("複数のイベントを作成できる", async () => {
    const event1 = await createEvent(setup.testUser.id, {
      title: "イベント1",
    });
    const event2 = await createEvent(setup.testUser.id, {
      title: "イベント2",
    });
    cleanupHelper.trackEvent(event1.id);
    cleanupHelper.trackEvent(event2.id);
    // afterEachで両方のイベントがクリーンアップされる
  });
});
```

**使い分けのポイント**:
- **`createTestDataCleanupHelper`**: 各テストで作成したリソースを`afterEach`でクリーンアップする場合
- **`cleanupTestData`**: 特定のリソースIDを指定して`afterAll`でクリーンアップする場合
- **`createCleanupTracker`**: テストスイート全体で作成したリソースを`afterAll`で一括クリーンアップする場合

```typescript
// ✅ 良い例: テストスイート全体のクリーンアップ（createCleanupTracker）
import { createCommonTestSetup } from "@tests/setup/common-test-setup";
import { createCleanupTracker } from "@tests/setup/common-cleanup";

describe("複雑なテストスイート", () => {
  let setup: CommonTestSetup;
  let tracker: ReturnType<typeof createCleanupTracker>;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `complex-test-${Date.now()}`,
    });
    tracker = createCleanupTracker();
  });

  afterAll(async () => {
    try {
      // すべてのリソースを一括クリーンアップ（ユーザーも含む）
      const result = await tracker.executeCleanup();
      if (!result.success) {
        console.warn("Some cleanup operations failed:", result.errors);
      }
      // setup.cleanup()は不要（trackerがユーザーもクリーンアップする）
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  });

  test("複数のリソースを作成", async () => {
    const event = await createEvent(setup.testUser.id, {
      title: "テストイベント",
    });
    tracker.trackEvent(event.id);

    const attendance = await createAttendance(event.id, {
      nickname: "参加者",
    });
    tracker.trackAttendance(attendance.id);

    const payment = await createPayment(attendance.id, {
      amount: 1000,
    });
    tracker.trackPayment(payment.id);

    // 追加のユーザーも追跡可能
    const additionalUser = await createTestUser("additional@example.com", "Password123!");
    tracker.trackUser(additionalUser.id, additionalUser.email);
  });
});
```

```typescript
// ✅ 良い例: cleanupTestDataを使用（特定のリソースIDを指定）
import { createCommonTestSetup } from "@tests/setup/common-test-setup";
import { cleanupTestData } from "@tests/setup/common-cleanup";

describe("イベント作成テスト", () => {
  let setup: CommonTestSetup;
  const createdEventIds: string[] = [];
  const createdAttendanceIds: string[] = [];

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `event-test-${Date.now()}`,
    });
  });

  afterAll(async () => {
    try {
      // 特定のリソースIDを指定してクリーンアップ
      await cleanupTestData({
        eventIds: createdEventIds,
        attendanceIds: createdAttendanceIds,
      });
      await setup.cleanup(); // ユーザーを削除
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  });

  test("イベントを作成できる", async () => {
    const event = await createEvent(setup.testUser.id, {
      title: "テストイベント",
    });
    createdEventIds.push(event.id); // IDを記録
    expect(event).toBeDefined();
  });

  test("参加登録を作成できる", async () => {
    const event = await createEvent(setup.testUser.id, {
      title: "テストイベント",
    });
    createdEventIds.push(event.id);

    const attendance = await createAttendance(event.id, {
      nickname: "参加者",
    });
    createdAttendanceIds.push(attendance.id);
    expect(attendance).toBeDefined();
  });
});
```

### エラーハンドリング（try-finallyパターン）

クリーンアップはエラーが発生しても実行されるように、`try-finally`パターンを使用します。これにより、テストが失敗した場合でも、クリーンアップ処理が確実に実行されます。

#### 基本的なパターン

```typescript
// ✅ 良い例: setup.cleanup()のみを使用する場合
afterAll(async () => {
  try {
    // テスト実行（必要に応じて）
  } finally {
    // 必ずクリーンアップを実行
    await setup.cleanup();
  }
});
```

#### 共通クリーンアップ関数を使用する場合

個別のクリーンアップ処理（イベント、参加、決済の個別削除）は、共通クリーンアップ関数を使用します。

```typescript
// ✅ 良い例: cleanupTestDataを使用
import { cleanupTestData } from "@tests/setup/common-cleanup";

afterAll(async () => {
  try {
    // テスト実行（必要に応じて）
  } finally {
    // 必ずクリーンアップを実行
    await cleanupTestData({ eventIds: createdEventIds });
    await setup.cleanup();
  }
});
```

```typescript
// ✅ 良い例: 複数のリソースをクリーンアップ
afterAll(async () => {
  try {
    // テスト実行（必要に応じて）
  } finally {
    // 必ずクリーンアップを実行
    await cleanupTestData({
      eventIds: createdEventIds,
      attendanceIds: createdAttendanceIds,
      paymentIds: createdPaymentIds,
      userEmails: [testUser.email],
    });
    await setup.cleanup();
  }
});
```

#### createCleanupTrackerを使用する場合

テストスイート全体で作成したリソースを一括でクリーンアップする場合：

```typescript
// ✅ 良い例: createCleanupTrackerを使用
import { createCleanupTracker } from "@tests/setup/common-cleanup";

describe("テストスイート", () => {
  let setup: CommonTestSetup;
  let tracker: ReturnType<typeof createCleanupTracker>;

  beforeAll(async () => {
    setup = await createCommonTestSetup();
    tracker = createCleanupTracker();
  });

  afterAll(async () => {
    try {
      // テスト実行（必要に応じて）
    } finally {
      // 必ずクリーンアップを実行
      const result = await tracker.executeCleanup();
      if (!result.success) {
        console.warn("Some cleanup operations failed:", result.errors);
      }
      await setup.cleanup();
    }
  });

  test("リソースを作成", async () => {
    const event = await createEvent(...);
    tracker.trackEvent(event.id);
    // ...
  });
});
```

#### afterEachでの適用

テスト間でのクリーンアップが必要な場合も、同様にtry-finallyパターンを使用します：

```typescript
// ✅ 良い例: afterEachでのクリーンアップ
afterEach(async () => {
  try {
    // テスト実行（必要に応じて）
  } finally {
    // 必ずクリーンアップを実行
    await cleanupHelper.cleanup();
    cleanupHelper.reset();
  }
});
```

#### よくある間違いとその修正方法

```typescript
// ❌ 悪い例: try-finallyパターンを使用していない
afterAll(async () => {
  await cleanupTestData({ eventIds: createdEventIds });
  await setup.cleanup();
});
```

```typescript
// ❌ 悪い例: 個別のtry-catchを使用している
afterAll(async () => {
  for (const eventId of createdEventIds) {
    try {
      await deleteTestEvent(eventId);
    } catch (error) {
      console.warn(`Failed to cleanup event ${eventId}:`, error);
    }
  }
  await setup.cleanup();
});
```

```typescript
// ✅ 良い例: 共通クリーンアップ関数とtry-finallyパターンを使用
afterAll(async () => {
  try {
    // テスト実行（必要に応じて）
  } finally {
    // 必ずクリーンアップを実行
    await cleanupTestData({ eventIds: createdEventIds });
    await setup.cleanup();
  }
});
```

#### エラーハンドリングのベストプラクティス

1. **必ずtry-finallyパターンを使用**: テストが失敗した場合でも、クリーンアップ処理が確実に実行されるようにします。
2. **共通クリーンアップ関数を使用**: 個別のクリーンアップ処理は、`cleanupTestData`や`safeCleanupTestData`などの共通関数を使用します。
3. **エラーをログに記録**: クリーンアップでエラーが発生した場合でも、テストを失敗させずにログに記録します（`cleanupTestData`は自動的にエラーハンドリングを行います）。
4. **クリーンアップの順序**: 外部キー制約を考慮して、正しい順序でクリーンアップを実行します（`cleanupTestData`は自動的に正しい順序で実行します）。

## アサーションのガイドライン

### エラーメッセージの検証方法

エラーレスポンスを検証する際は、構造化されたアサーションを使用します。

```typescript
// ✅ 良い例
test("バリデーションエラーを返す", async () => {
  const result = await submitContact(invalidInput);

  expect(result).toHaveProperty("success", false);
  expect(result).toHaveProperty("code", "VALIDATION_ERROR");
  if (!result.success) {
    expect(result.error).toBeDefined();
  }
});
```

### 詳細なアサーションの書き方

重要なプロパティは明示的に検証します。

```typescript
// ✅ 良い例
test("イベントが正しく作成される", async () => {
  const event = await createEvent(setup.testUser.id, {
    title: "テストイベント",
    date: "2024-01-01T00:00:00Z",
    fee: 1000,
  });

  expect(event).toBeDefined();
  expect(event.id).toBeDefined();
  expect(event.title).toBe("テストイベント");
  expect(event.fee).toBe(1000);
  expect(event.created_by).toBe(setup.testUser.id);
});
```

### テストデータの検証方法

データベースに保存されたデータを検証する際は、適切なクエリを使用します。

```typescript
// ✅ 良い例
test("イベントがデータベースに保存される", async () => {
  const event = await createEvent(setup.testUser.id, {
    title: "テストイベント",
  });

  const savedEvent = await setup.adminClient
    .from("events")
    .select("*")
    .eq("id", event.id)
    .single();

  expect(savedEvent.data).toBeDefined();
  expect(savedEvent.data.title).toBe("テストイベント");
});
```

## コード例

### 統合テストの完全な例

```typescript
import { describe, test, expect, beforeAll, afterAll, afterEach } from "@jest/globals";

import { createCommonTestSetup, createTestDataCleanupHelper } from "@tests/setup/common-test-setup";
import { setupCommonMocks, resetCommonMocks } from "@tests/setup/common-mocks";
import type { CommonTestSetup } from "@tests/setup/common-test-setup";
import type { CommonMocks } from "@tests/setup/common-mocks";
import type { TestDataCleanupHelper } from "@tests/setup/common-test-setup";

describe("イベント作成 統合テスト", () => {
  let setup: CommonTestSetup;
  let mocks: CommonMocks;
  let cleanupHelper: TestDataCleanupHelper;

  beforeAll(async () => {
    // セットアップ
    setup = await createCommonTestSetup({
      testName: `event-creation-test-${Date.now()}`,
      withConnect: false,
    });

    // モック設定
    mocks = setupCommonMocks(setup.testUser, {
      includeLogger: true,
    });

    // クリーンアップヘルパー
    cleanupHelper = createTestDataCleanupHelper(setup.adminClient);
  });

  afterAll(async () => {
    // テストスイート全体のクリーンアップ
    try {
      await setup.cleanup();
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  });

  afterEach(async () => {
    // モックのリセット
    resetCommonMocks(mocks);

    // テスト間データのクリーンアップ
    try {
      await cleanupHelper.cleanup();
      cleanupHelper.reset();
    } catch (error) {
      console.warn("Inter-test cleanup failed:", error);
    }
  });

  test("有料イベントを作成できる", async () => {
    // Arrange
    const eventData = {
      title: "有料イベント",
      date: new Date().toISOString(),
      fee: 1500,
      paymentMethods: ["stripe", "cash"],
    };

    // Act
    const event = await createEvent(setup.testUser.id, eventData);
    cleanupHelper.trackEvent(event.id);

    // Assert
    expect(event).toBeDefined();
    expect(event.title).toBe("有料イベント");
    expect(event.fee).toBe(1500);
  });

  test("無料イベントを作成できる", async () => {
    // Arrange
    const eventData = {
      title: "無料イベント",
      date: new Date().toISOString(),
      fee: 0,
    };

    // Act
    const event = await createEvent(setup.testUser.id, eventData);
    cleanupHelper.trackEvent(event.id);

    // Assert
    expect(event).toBeDefined();
    expect(event.title).toBe("無料イベント");
    expect(event.fee).toBe(0);
  });
});
```

### 単体テストの完全な例

```typescript
import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { jest } from "@jest/globals";

import { setupCommonMocks, resetCommonMocks } from "@tests/setup/common-mocks";
import type { CommonMocks } from "@tests/setup/common-mocks";

// モックを設定（ファイルのトップレベル）
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("関数名 単体テスト", () => {
  let mocks: CommonMocks;

  beforeEach(() => {
    // モック設定
    mocks = setupCommonMocks(
      { id: "test-user-id", email: "test@example.com" },
      {
        includeLogger: true,
      }
    );
  });

  afterEach(() => {
    // モックのリセット
    resetCommonMocks(mocks);
    jest.clearAllMocks();
  });

  test("正常系: 関数が正しく動作する", async () => {
    // Arrange
    const input = { /* テストデータ */ };

    // Act
    const result = await targetFunction(input);

    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  test("異常系: エラーが正しく処理される", async () => {
    // Arrange
    const invalidInput = { /* 無効なデータ */ };

    // Act
    const result = await targetFunction(invalidInput);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

## Phase 3で追加された共通モック関数の使用例

### Next.js cacheモック

```typescript
import { setupNextCacheMocks } from "@tests/setup/common-mocks";

// モック化の宣言（ファイルのトップレベル）
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

describe("イベント更新テスト", () => {
  beforeAll(() => {
    // 共通モックを使用してNext.js cacheを設定
    setupNextCacheMocks();
  });

  it("イベント更新時にキャッシュが無効化される", async () => {
    // テスト実装
  });
});
```

### レート制限モックの共通化

```typescript
import { setupRateLimitMocks } from "@tests/setup/common-mocks";

// レート制限のモック（共通関数を使用するため、モック化のみ宣言）
jest.mock("@core/rate-limit", () => {
  const actual = jest.requireActual("@core/rate-limit");
  return {
    ...actual,
    enforceRateLimit: jest.fn(),
    buildKey: jest.fn(),
    POLICIES: {
      ...actual.POLICIES,
      "custom.policy": {
        scope: "custom.policy",
        limit: 10,
        window: "1 m",
        blockMs: 5 * 60 * 1000,
      },
    },
  };
});

describe("レート制限テスト", () => {
  beforeAll(() => {
    // 共通モックを使用してレート制限を設定
    setupRateLimitMocks(true, "RL:custom.policy:127.0.0.1");
  });

  it("レート制限が正しく機能する", async () => {
    // テスト実装
  });
});
```

### Next.js headersモックの共通化

```typescript
import { setupNextHeadersMocks } from "@tests/setup/common-mocks";

// Next.js headers モック（共通関数を使用するため、モック化のみ宣言）
jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

describe("認証テスト", () => {
  beforeEach(() => {
    // 共通モックを使用してNext.js headersを設定
    const mockHeaders = setupNextHeadersMocks({
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/login",
      "user-agent": "test-user-agent",
    });
    const { headers } = require("next/headers");
    (headers as jest.MockedFunction<typeof headers>).mockReturnValue(mockHeaders as any);
  });

  it("認証が正しく機能する", async () => {
    // テスト実装
  });
});
```

## まとめ

- **AAAパターン**を使用してテストを構造化する
- **共通関数**を活用してコードの重複を削減する
- **適切なタイミング**でクリーンアップを実行する
- **エラーハンドリング**を適切に行う
- **詳細なアサーション**でテストの信頼性を向上させる
- **Phase 3で追加された共通モック関数**を積極的に使用する

これらのガイドラインに従うことで、保守性が高く、信頼性の高いテストコードを書くことができます。
