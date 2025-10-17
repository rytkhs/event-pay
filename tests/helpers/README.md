# テストヘルパー

EventPayのテスト用ヘルパー関数とユーティリティについて説明します。

## ファイル構成

```
tests/helpers/
├── test-event.ts           # イベント作成ヘルパー
├── test-user.ts           # ユーザー作成ヘルパー
├── test-payment-data.ts   # 決済テスト用データ作成ヘルパー
└── README.md              # このファイル
```

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

### グローバルテストデータ管理

```typescript
import { testDataManager } from '@/tests/setup/test-data-seeds';

// テストデータを初期化（一度だけ実行）
const testData = await testDataManager.setupTestData();

// テストデータを取得
const data = testDataManager.getTestData();

// クリーンアップ
await testDataManager.cleanupTestData();
```

### Jest統合

```typescript
import { setupPaymentTestData, cleanupPaymentTestData } from '@/tests/setup/test-data-seeds';

describe('決済テスト', () => {
  let testData: TestDataSeed;

  beforeAll(async () => {
    testData = await setupPaymentTestData();
  });

  afterAll(async () => {
    await cleanupPaymentTestData();
  });

  it('Connect設定済みユーザーで決済開始', async () => {
    const user = testData.users.withConnect;
    // テスト実装...
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
