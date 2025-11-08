# テストヘルパー

EventPayのテスト用ヘルパー関数とユーティリティについて説明します。

## ファイル構成

```
tests/helpers/
├── test-event.ts                        # イベント作成ヘルパー
├── test-user.ts                        # ユーザー作成ヘルパー
├── test-payment-data.ts                # 決済テスト用データ作成ヘルパー
├── test-datetime.ts                    # 日時生成ヘルパー
├── test-form-data.ts                   # フォームデータ作成ヘルパー
├── test-verify-session.ts              # verify-session APIテストヘルパー
├── test-payment-session-idempotency.ts # 決済セッション冪等性テストヘルパー
├── test-mailpit.ts                     # Mailpit（メールテスト）ヘルパー
├── test-mock-setup.ts                  # モック設定ヘルパー
├── payment-completion-guard-helpers.ts # 決済完了ガードテストヘルパー
└── README.md                           # このファイル
```

## 命名規則

### ヘルパーファイルの命名規則

テストヘルパーファイルは以下の命名規則に従います：

#### 基本規則
- **汎用ヘルパー**: `test-{機能名}.ts`
  - 例: `test-user.ts`, `test-payment-data.ts`, `test-event.ts`
- **特定テスト用ヘルパー**: `test-{機能名}.ts`
  - 例: `test-verify-session.ts`, `test-payment-session-idempotency.ts`
- **セットアップ専用ヘルパー**: `test-{機能名}-setup.ts`
  - 例: `test-race-condition-setup.ts`
- **モック設定ヘルパー**: `test-{機能名}-mock.ts` または `test-mock-{機能名}.ts`
  - 例: `test-mock-setup.ts`

#### 命名規則の詳細

1. **プレフィックス**: すべてのヘルパーファイルは `test-` で始まる
2. **ケバブケース**: ファイル名はケバブケース（kebab-case）を使用
3. **サフィックス**:
   - 通常のヘルパー: サフィックスなし
   - セットアップ専用: `-setup` サフィックス
   - モック専用: `-mock` サフィックスまたは `mock-` プレフィックス

#### 非推奨の命名パターン

以下の命名パターンは非推奨です（既存ファイルは段階的にリネーム予定）：
- `{機能名}.helper.ts` - `test-{機能名}.ts` に変更
- `{機能名}-test.helper.ts` - `test-{機能名}.ts` に変更
- `{機能名}-helper.ts` - `test-{機能名}.ts` に変更

#### 命名例

| 旧名称（非推奨） | 新名称（推奨） |
|----------------|--------------|
| `mock-setup.helper.ts` | `test-mock-setup.ts` |
| `payment-session-idempotency-test.helper.ts` | `test-payment-session-idempotency.ts` |
| `verify-session-test.helper.ts` | `test-verify-session.ts` |
| `race-condition-setup.helper.ts` | `test-race-condition-setup.ts` |
| `mailpit-helper.ts` | `test-mailpit.ts` |

#### 関数の命名規則

ヘルパー関数は以下の命名規則に従います：

- **作成関数**: `create{ObjectName}` または `create{ObjectName}`
  - 例: `createTestUser`, `createPaidTestEvent`
- **削除関数**: `delete{ObjectName}` または `cleanup{ObjectName}`
  - 例: `deleteTestUser`, `cleanupTestPaymentData`
- **セットアップ関数**: `setup{TestName}Test` または `create{TestName}TestSetup`
  - 例: `setupPaymentTest`, `createWebhookTestSetup`
- **クリーンアップ関数**: `cleanup{TestName}Test` または `cleanup{ObjectName}`
  - 例: `cleanupPaymentTest`, `cleanupTestData`

## 決済テスト用ヘルパー (`test-payment-data.ts`)

### 基本的な使用方法

```typescript
import {
  createTestUserWithConnect,
  createTestUserWithoutConnect,
  createPaidTestEvent,
  createPendingTestPayment,
} from '@/tests/helpers/test-payment-data';

// Connect設定済みユーザー
const userWithConnect = await createTestUserWithConnect();

// Connect未設定ユーザー
const userWithoutConnect = await createTestUserWithoutConnect();

// 有料イベント
const paidEvent = await createPaidTestEvent(userWithConnect.id, {
  fee: 1500,
  capacity: 50,
});

// pending状態の決済
const pendingPayment = await createPendingTestPayment(attendanceId, {
  amount: 1500,
  stripeAccountId: userWithConnect.stripeConnectAccountId,
});
```

### 完全なテストシナリオ

```typescript
import { createCompleteTestScenario } from '@/tests/helpers/test-payment-data';

const scenario = await createCompleteTestScenario("my-test");
// 以下が含まれます：
// - userWithConnect: Connect設定済みユーザー
// - userWithoutConnect: Connect未設定ユーザー
// - userWithDisabledPayouts: payouts無効ユーザー
// - paidEvent: 有料イベント
// - freeEvent: 無料イベント
// - attendance: 参加者データ
// - pendingPayment: pending決済
// - existingAmountPayment: 既存金額の決済
```

### ユーザータイプ別作成

```typescript
// Connect設定済み（payouts有効）
const activeUser = await createTestUserWithConnect();

// payouts無効
const payoutsDisabledUser = await createTestUserWithDisabledPayouts();

// Connect未設定
const noConnectUser = await createTestUserWithoutConnect();
```

### テストカード情報

```typescript
import { TEST_CARD_NUMBERS } from '@/tests/helpers/test-payment-data';

// 成功パターン
TEST_CARD_NUMBERS.VISA_SUCCESS        // "4242424242424242"
TEST_CARD_NUMBERS.MASTERCARD_SUCCESS  // "5555555555554444"

// エラーパターン
TEST_CARD_NUMBERS.CARD_DECLINED       // "4000000000000002"
TEST_CARD_NUMBERS.INSUFFICIENT_FUNDS  // "4000000000009995"
TEST_CARD_NUMBERS.EXPIRED_CARD        // "4000000000000069"
TEST_CARD_NUMBERS.REQUIRES_3DS        // "4000002760003184"
```

## テストデータシード (`../setup/test-data-seeds.ts`)

### テストごとの独立データ作成（推奨）

```typescript
import { createTestDataSeed, cleanupTestDataSeed } from '@/tests/setup/test-data-seeds';

describe('決済テスト', () => {
  let testData: TestDataSeed;

  beforeAll(async () => {
    // テストごとに新しいデータを作成
    testData = await createTestDataSeed('my-test-scenario');
  });

  afterAll(async () => {
    // 作成したデータをクリーンアップ
    await cleanupTestDataSeed(testData);
  });

  it('Connect設定済みユーザーで決済開始', async () => {
    const user = testData.users.withConnect;
    // テスト実装...
  });
});
```

### 後方互換性のための関数（非推奨）

```typescript
import { setupPaymentTestData, cleanupPaymentTestData } from '@/tests/setup/test-data-seeds';

// 注意: これらの関数は後方互換性のため残されていますが、
// 新しいコードでは createTestDataSeed() と cleanupTestDataSeed() を使用してください
describe('決済テスト', () => {
  let testData: TestDataSeed;

  beforeAll(async () => {
    testData = await setupPaymentTestData('my-scenario');
  });

  afterAll(async () => {
    await cleanupPaymentTestData(testData);
  });
});
```

### 個別テスト用ミニマルデータ

```typescript
import { createMinimalTestData, createConnectTestData } from '@/tests/setup/test-data-seeds';

// 基本的なユーザーのみ
const { userWithConnect, userWithoutConnect } = await createMinimalTestData();

// Connect関連テスト用
const { activeUser, payoutsDisabledUser, noConnectUser } = await createConnectTestData();
```

## フィクスチャ (`../fixtures/payment-test-fixtures.ts`)

### 事前定義されたテストデータ

```typescript
import {
  eventFixtures,
  userFixtures,
  paymentFixtures,
  scenarioFixtures,
} from '@/tests/fixtures/payment-test-fixtures';

// イベントデータ
const paidEvent = eventFixtures.paidEvent;
const freeEvent = eventFixtures.freeEvent;

// ユーザーデータ
const userWithConnect = userFixtures.withConnect;
const userWithoutConnect = userFixtures.withoutConnect;

// 決済データ
const pendingPayment = paymentFixtures.pending;
const paidPayment = paymentFixtures.paid;

// テストシナリオ
const normalFlow = scenarioFixtures.normalPaymentFlow;
const connectError = scenarioFixtures.connectNotSetupError;
```

### Webhook イベント

```typescript
import { webhookEventFixtures } from '@/tests/fixtures/payment-test-fixtures';

const checkoutCompleted = webhookEventFixtures.checkoutCompleted();
const paymentSucceeded = webhookEventFixtures.paymentIntentSucceeded();
const paymentFailed = webhookEventFixtures.paymentIntentFailed();
```

## データクリーンアップ

### 個別クリーンアップ

```typescript
import { cleanupTestPaymentData } from '@/tests/helpers/test-payment-data';

await cleanupTestPaymentData({
  paymentIds: ["pay_test_1", "pay_test_2"],
  attendanceIds: ["att_test_1"],
  eventIds: ["evt_test_1"],
  userIds: ["user_test_1"],
});
```

### ユーザー削除

```typescript
import { deleteTestUser } from '@/tests/helpers/test-user';

await deleteTestUser("test@example.com");
```

## ベストプラクティス

### 1. テストデータの分離

```typescript
// ✅ 良い例：テストごとに独立したデータ
describe('決済開始テスト', () => {
  it('正常ケース', async () => {
    const scenario = await createCompleteTestScenario("payment-start-success");
    // テスト実装...
    await cleanupTestPaymentData(/* scenario data */);
  });
});

// ❌ 悪い例：共有データによる依存関係
let sharedUser; // 他のテストに影響する可能性
```

### 2. エラーハンドリング

```typescript
// ✅ 良い例：エラー時のクリーンアップ
describe('決済テスト', () => {
  let testData;

  beforeEach(async () => {
    try {
      testData = await createCompleteTestScenario("test");
    } catch (error) {
      console.error("Setup failed:", error);
      throw error;
    }
  });

  afterEach(async () => {
    if (testData) {
      await cleanupTestPaymentData(/* testData */);
    }
  });
});
```

### 3. パフォーマンス

```typescript
// ✅ 良い例：必要最小限のデータ
const { userWithConnect, userWithoutConnect } = await createMinimalTestData();

// ❌ 悪い例：不要な大量データ
const fullScenario = await createCompleteTestScenario("simple-test"); // オーバーキル
```

## トラブルシューティング

### よくある問題

1. **データ作成エラー**: Supabase接続を確認
2. **クリーンアップ失敗**: 外部キー制約の順序に注意
3. **重複データエラー**: ユニークなIDの生成を確認

### デバッグ

```typescript
import { verifyTestEnvironment } from '@/tests/setup/test-data-seeds';

const health = await verifyTestEnvironment();
console.log("Test environment health:", health);
```

## 日時ヘルパー (`test-datetime.ts`)

### 基本的な使用方法

```typescript
import { getFutureDateTime, getPastDateTime, getFutureDateTimeLocal } from '@/tests/helpers/test-datetime';

// 将来の日時（ISO 8601形式）
const futureDate = getFutureDateTime(24); // 24時間後
const futureDate2 = getFutureDateTime(48); // 48時間後

// 過去の日時（ISO 8601形式）
const pastDate = getPastDateTime(24); // 24時間前

// 将来の日時（datetime-local形式）
const futureLocal = getFutureDateTimeLocal(24); // 24時間後（フォーム用）
```

## フォームデータヘルパー (`test-form-data.ts`)

### 基本的な使用方法

```typescript
import { createFormDataFromEvent } from '@/tests/helpers/test-form-data';

const formData = createFormDataFromEvent({
  title: "テストイベント",
  date: "2025-01-15T10:30",
  fee: "1500",
  payment_methods: ["stripe", "cash"],
  location: "テスト会場",
  description: "テスト説明",
  capacity: "50",
  registration_deadline: "2025-01-14T10:30",
  payment_deadline: "2025-01-14T20:30",
  allow_payment_after_deadline: true,
  grace_period_days: "7",
});
```

## verify-session APIテストヘルパー (`test-verify-session.ts`)

### 基本的な使用方法

```typescript
import { VerifySessionTestHelper, COMMON_VERIFY_SESSION_SCENARIOS } from '@/tests/helpers/test-verify-session';

// 完全なセットアップを作成
const setup = await VerifySessionTestHelper.createCompleteSetup("my-test");
const helper = new VerifySessionTestHelper(setup);

// 共通シナリオを実行
const scenarios = COMMON_VERIFY_SESSION_SCENARIOS;
for (const scenario of scenarios) {
  const result = await helper.runScenario(scenario);
  // アサーション
}

// カスタムシナリオを実行
await helper.runScenario({
  name: "カスタムシナリオ",
  sessionId: "cs_test_123",
  paymentStatus: "pending",
  expectedResult: {
    success: true,
    payment_status: "pending",
  },
});
```

## 決済セッション冪等性テストヘルパー (`test-payment-session-idempotency.ts`)

### 基本的な使用方法

```typescript
import { PaymentSessionIdempotencyTestHelper } from '@/tests/helpers/test-payment-session-idempotency';

const helper = new PaymentSessionIdempotencyTestHelper();
const setup = await helper.createTestSetup("my-test");

// 冪等性テストを実行
const result = await helper.testIdempotency(setup, {
  attendanceId: setup.attendance.id,
  amount: 1500,
});

expect(result.isIdempotent).toBe(true);
```

## Mailpitヘルパー (`test-mailpit.ts`)

### 基本的な使用方法

```typescript
import { extractOtpFromEmail, extractPasswordResetLinkFromEmail } from '@/tests/helpers/test-mailpit';

// メール本文からOTPを抽出
const emailBody = "Your OTP is 123456";
const otp = extractOtpFromEmail(emailBody); // "123456"

// メール本文からパスワードリセットリンクを抽出
const resetLink = extractPasswordResetLinkFromEmail(emailBody);
```

## モック設定ヘルパー (`test-mock-setup.ts`)

### 基本的な使用方法

```typescript
import { MockSetupHelper } from '@/tests/helpers/test-mock-setup';

const helper = new MockSetupHelper();
const mockToken = helper.createMockToken({
  userId: "user-123",
  email: "test@example.com",
});
```

## 決済完了ガードテストヘルパー (`payment-completion-guard-helpers.ts`)

### 基本的な使用方法

```typescript
import { calculateExpectedGuardBehavior } from '@/tests/helpers/payment-completion-guard-helpers';

const result = calculateExpectedGuardBehavior({
  paymentStatus: "paid",
  eventFee: 1500,
  paymentAmount: 1500,
  paymentMethod: "stripe",
});

expect(result.shouldAllowAccess).toBe(true);
```

## ベストプラクティス

テストデータ管理のベストプラクティスについては、以下のドキュメントを参照してください：

- [テストデータ管理ベストプラクティス](../../docs/TEST_DATA_MANAGEMENT_BEST_PRACTICES.md)

主なポイント：
- **テストの独立性**: 各テストは独立したデータを使用
- **ファクトリーパターン**: テストデータの作成にはファクトリーパターンを活用
- **適切なクリーンアップ**: すべてのパスでクリーンアップを保証
- **並列実行への対応**: 一意のID/メールアドレスを使用
- **共通ヘルパーの活用**: 既存のヘルパー関数を積極的に使用してコードの重複を削減
