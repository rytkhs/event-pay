/**
 * 共通テストセットアップ関数
 *
 * テストコードの重複を削減するための共通セットアップ関数群
 * 既存のヘルパー関数を活用し、よく使われるパターンを共通化
 */

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import {
  createPaidTestEvent,
  createTestAttendance,
  createTestUserWithConnect,
  cleanupTestPaymentData,
  type TestPaymentEvent,
  type TestAttendanceData,
  type TestPaymentUser,
} from "@tests/helpers/test-payment-data";
import { createTestUser, deleteTestUser, type TestUser } from "@tests/helpers/test-user";

import type { Database } from "@/types/database";

/**
 * 共通テストセットアップの基本インターフェース
 */
export interface CommonTestSetup {
  testUser: TestUser;
  adminClient: any;
  cleanup: () => Promise<void>;
}

/**
 * 決済テスト用のセットアップインターフェース
 */
export interface PaymentTestSetup extends CommonTestSetup {
  testUser: TestPaymentUser;
  testEvent: TestPaymentEvent;
  testAttendance: TestAttendanceData;
}

/**
 * Webhookテスト用のセットアップインターフェース
 */
export interface WebhookTestSetup extends PaymentTestSetup {
  // Webhookテスト用の追加プロパティがあればここに追加
}

/**
 * 複数ユーザーテスト用のセットアップインターフェース
 */
export interface MultiUserTestSetup {
  users: TestUser[];
  adminClient: any;
  cleanup: () => Promise<void>;
}

/**
 * テスト間データクリーンアップヘルパーのインターフェース
 */
export interface TestDataCleanupHelper {
  trackEvent: (eventId: string) => void;
  trackAttendance: (attendanceId: string) => void;
  trackPayment: (paymentId: string) => void;
  cleanup: () => Promise<void>;
  reset: () => void;
}

/**
 * 共通テストセットアップのオプション
 */
export interface CommonTestSetupOptions {
  /**
   * Connect設定済みユーザーを作成するか
   */
  withConnect?: boolean;
  /**
   * 有料イベントを作成するか
   */
  withEvent?: boolean;
  /**
   * 参加登録を作成するか（withEventがtrueの場合のみ有効）
   */
  withAttendance?: boolean;
  /**
   * テスト名（メールアドレスやイベントタイトルの生成に使用）
   */
  testName?: string;
  /**
   * イベントの料金（withEventがtrueの場合）
   */
  eventFee?: number;
  /**
   * 決済方法（withEventがtrueの場合）
   */
  paymentMethods?: Database["public"]["Enums"]["payment_method_enum"][];
  /**
   * アクセスするテーブルリスト（adminClient作成時に使用）
   */
  accessedTables?: string[];
  /**
   * adminClientを作成するか（デフォルト: true）
   * falseに設定すると、adminClientは作成されず、undefinedが返されます
   */
  withAdminClient?: boolean;
  /**
   * ユーザー作成時の追加オプション
   * withConnectがtrueの場合: createTestUserWithConnectのオプション（payoutsEnabled, chargesEnabled, stripeAccountId）
   * withConnectがfalseの場合: createTestUserのオプション（maxRetries, retryDelay, skipProfileCreation）
   */
  customUserOptions?: {
    // createTestUserWithConnect用
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
    stripeAccountId?: string;
    // createTestUser用
    maxRetries?: number;
    retryDelay?: number;
    skipProfileCreation?: boolean;
  };
  /**
   * クリーンアップをスキップするか（デフォルト: false）
   * trueに設定すると、cleanup関数は何も実行しません
   */
  skipCleanup?: boolean;
}

/**
 * 基本的なテストセットアップを作成
 *
 * テストユーザーとSupabase adminクライアントを作成し、クリーンアップ関数を提供します。
 * 統合テストで最も基本的なセットアップに使用します。
 *
 * @param options セットアップオプション
 * @returns テストセットアップオブジェクト
 *
 * @example
 * 基本的な使用例（Connect設定なしのユーザー）
 * ```typescript
 * describe("イベント作成テスト", () => {
 *   let setup: CommonTestSetup;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup({
 *       testName: `event-creation-test-${Date.now()}`,
 *       withConnect: false,
 *     });
 *   });
 *
 *   afterAll(async () => {
 *     await setup.cleanup();
 *   });
 *
 *   it("イベントを作成できる", async () => {
 *     const event = await createEvent(setup.testUser.id, {
 *       title: "テストイベント",
 *     });
 *     expect(event).toBeDefined();
 *   });
 * });
 * ```
 *
 * @example
 * Connect設定済みユーザーが必要な場合
 * ```typescript
 * describe("決済機能テスト", () => {
 *   let setup: CommonTestSetup;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup({
 *       testName: `payment-test-${Date.now()}`,
 *       withConnect: true,
 *       customUserOptions: {
 *         payoutsEnabled: true,
 *         chargesEnabled: true,
 *         stripeAccountId: "acct_test_123",
 *       },
 *     });
 *   });
 *
 *   afterAll(async () => {
 *     await setup.cleanup();
 *   });
 * });
 * ```
 *
 * @example
 * adminClientが不要な場合（単体テストなど）
 * ```typescript
 * describe("単体テスト", () => {
 *   let setup: CommonTestSetup;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup({
 *       testName: `unit-test-${Date.now()}`,
 *       withAdminClient: false,
 *     });
 *   });
 *
 *   afterAll(async () => {
 *     await setup.cleanup();
 *   });
 * });
 * ```
 *
 * @example
 * イベントと参加登録も含むセットアップ
 * ```typescript
 * describe("参加登録テスト", () => {
 *   let setup: CommonTestSetup;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup({
 *       testName: `attendance-test-${Date.now()}`,
 *       withEvent: true,
 *       withAttendance: true,
 *       eventFee: 1500,
 *       paymentMethods: ["stripe"],
 *     });
 *   });
 *
 *   afterAll(async () => {
 *     await setup.cleanup();
 *   });
 * });
 * ```
 */
export async function createCommonTestSetup(
  options: CommonTestSetupOptions = {}
): Promise<CommonTestSetup> {
  const {
    withConnect = false,
    testName = `test-${Date.now()}`,
    accessedTables = ["public.users", "public.events", "public.attendances", "public.payments"],
    withAdminClient = true,
    customUserOptions,
    skipCleanup = false,
  } = options;

  // テストユーザーを作成
  const testUser = withConnect
    ? await createTestUserWithConnect(
        `${testName}@example.com`,
        "TestPassword123!",
        customUserOptions
          ? {
              payoutsEnabled: customUserOptions.payoutsEnabled,
              chargesEnabled: customUserOptions.chargesEnabled,
              stripeAccountId: customUserOptions.stripeAccountId,
            }
          : {}
      )
    : await createTestUser(
        `${testName}@example.com`,
        "TestPassword123!",
        customUserOptions
          ? {
              maxRetries: customUserOptions.maxRetries,
              retryDelay: customUserOptions.retryDelay,
              skipProfileCreation: customUserOptions.skipProfileCreation,
            }
          : {}
      );

  // Supabaseクライアント取得（オプションでスキップ可能）
  let adminClient: any;
  if (withAdminClient) {
    const factory = SecureSupabaseClientFactory.create();
    adminClient = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      `${testName} test setup`,
      {
        operationType: "SELECT",
        accessedTables,
        additionalInfo: { testContext: testName },
      }
    );
  }

  // クリーンアップ関数
  const cleanup = async () => {
    if (!skipCleanup) {
      await deleteTestUser(testUser.email);
    }
  };

  return {
    testUser,
    adminClient,
    cleanup,
  };
}

/**
 * 決済テスト用のセットアップオプション
 */
export interface PaymentTestSetupOptions extends CommonTestSetupOptions {
  /**
   * fee_configのセットアップを含めるか（デフォルト: false）
   * trueに設定すると、統合テスト用のfee_configデータがセットアップされます
   */
  withFeeConfig?: boolean;
  /**
   * Stripe Connectアカウントの追加オプション
   * createTestUserWithConnectに渡されるオプション
   */
  customStripeAccountOptions?: {
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
    stripeAccountId?: string;
  };
}

/**
 * fee_config デフォルトデータをセットアップ
 * 決済機能の統合テストに必要な最低限の手数料設定を挿入
 */
async function setupFeeConfigForIntegrationTest(adminClient: any): Promise<void> {
  try {
    // 既存のfee_configを確認
    const { data: existing } = await adminClient.from("fee_config").select("*").limit(1);

    if (existing && existing.length > 0) {
      // eslint-disable-next-line no-console
      console.log("✓ fee_config already exists, skipping setup");
      return;
    }

    // デフォルト手数料設定を挿入（実際のスキーマに合わせる）
    const { error } = await adminClient.from("fee_config").insert({
      id: 1,
      stripe_base_rate: 0.036, // 3.6%
      stripe_fixed_fee: 0, // 0円
      platform_fee_rate: 0.049, // 4.9%
      platform_fixed_fee: 0, // 0円
      min_platform_fee: 0, // 0円
      max_platform_fee: 0, // 0円
      min_payout_amount: 100, // 100円
      platform_tax_rate: 10.0, // 10%
      is_tax_included: true, // 内税
    });

    if (error) {
      throw new Error(`Failed to setup fee_config: ${error.message}`);
    }

    // eslint-disable-next-line no-console
    console.log("✓ fee_config setup completed for integration tests");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("❌ Failed to setup fee_config:", error);
    throw error;
  }
}

/**
 * 決済テスト用のセットアップを作成
 *
 * Connect設定済みユーザー、有料イベント、参加登録を作成し、
 * 決済テストに必要なデータを一括でセットアップします。
 *
 * @param options セットアップオプション
 * @returns 決済テストセットアップオブジェクト
 *
 * @example
 * ```typescript
 * describe("決済テスト", () => {
 *   let setup: PaymentTestSetup;
 *
 *   beforeAll(async () => {
 *     setup = await createPaymentTestSetup({
 *       testName: `payment-test-${Date.now()}`,
 *       eventFee: 1500,
 *       withFeeConfig: true,
 *     });
 *   });
 *
 *   afterAll(async () => {
 *     await setup.cleanup();
 *   });
 *
 *   it("決済を処理できる", async () => {
 *     const payment = await processPayment({
 *       eventId: setup.testEvent.id,
 *       attendanceId: setup.testAttendance.id,
 *     });
 *     expect(payment).toBeDefined();
 *   });
 * });
 * ```
 */
export async function createPaymentTestSetup(
  options: PaymentTestSetupOptions = {}
): Promise<PaymentTestSetup> {
  const {
    testName = `payment-test-${Date.now()}`,
    eventFee = 1500,
    paymentMethods,
    accessedTables = ["public.payments", "public.attendances", "public.events"],
    withFeeConfig = false,
    customStripeAccountOptions,
  } = options;

  // Connect設定済みユーザーを作成
  const testUser = await createTestUserWithConnect(
    `${testName}@example.com`,
    "TestPassword123!",
    customStripeAccountOptions || {}
  );

  // 有料イベントを作成
  const testEvent = await createPaidTestEvent(testUser.id, {
    title: `${testName} Event`,
    fee: eventFee,
    paymentMethods,
  });

  // 参加登録を作成
  const testAttendance = await createTestAttendance(testEvent.id);

  // Supabaseクライアント取得
  const factory = SecureSupabaseClientFactory.create();
  const adminClient = await factory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `${testName} payment test setup`,
    {
      operationType: "SELECT",
      accessedTables: withFeeConfig ? [...accessedTables, "public.fee_config"] : accessedTables,
      additionalInfo: { testContext: "payment-test" },
    }
  );

  // fee_configのセットアップ（オプション）
  if (withFeeConfig) {
    await setupFeeConfigForIntegrationTest(adminClient);
  }

  // クリーンアップ関数
  const cleanup = async () => {
    await cleanupTestPaymentData({
      attendanceIds: [testAttendance.id],
      eventIds: [testEvent.id],
      userIds: [testUser.id],
    });
    await deleteTestUser(testUser.email);
  };

  return {
    testUser,
    adminClient,
    testEvent,
    testAttendance,
    cleanup,
  };
}

/**
 * Webhookテスト用のセットアップを作成
 *
 * QStash環境変数を設定し、決済テスト用のセットアップを作成します。
 * Webhookテストで必要なQStash署名検証の環境変数も自動的に設定されます。
 *
 * @param options セットアップオプション
 * @returns Webhookテストセットアップオブジェクト
 *
 * @example
 * ```typescript
 * describe("Webhookテスト", () => {
 *   let setup: WebhookTestSetup;
 *
 *   beforeAll(async () => {
 *     setup = await createWebhookTestSetup({
 *       testName: `webhook-test-${Date.now()}`,
 *       eventFee: 1500,
 *     });
 *   });
 *
 *   afterAll(async () => {
 *     await setup.cleanup();
 *   });
 *
 *   it("Webhookイベントを処理できる", async () => {
 *     const event = createWebhookEvent("payment_intent.succeeded");
 *     await handleWebhook(event);
 *   });
 * });
 * ```
 */
export async function createWebhookTestSetup(
  options: CommonTestSetupOptions = {}
): Promise<WebhookTestSetup> {
  // QStash環境変数を設定
  process.env.QSTASH_CURRENT_SIGNING_KEY = "test_current_key";
  process.env.QSTASH_NEXT_SIGNING_KEY = "test_next_key";

  // 決済テスト用のセットアップを作成
  const paymentSetup = await createPaymentTestSetup({
    ...options,
    testName: options.testName || `webhook-test-${Date.now()}`,
    accessedTables: options.accessedTables || [
      "public.payments",
      "public.attendances",
      "public.events",
    ],
  });

  return paymentSetup;
}

/**
 * 複数ユーザーテスト用のセットアップを作成
 *
 * 複数のテストユーザーを作成し、認証テストやアクセス制御テストに使用します。
 * オプションでConnect設定済みユーザーも作成可能です。
 *
 * @param options セットアップオプション
 * @returns 複数ユーザーテストセットアップオブジェクト
 *
 * @example
 * ```typescript
 * describe("複数ユーザーテスト", () => {
 *   let setup: MultiUserTestSetup;
 *
 *   beforeAll(async () => {
 *     setup = await createMultiUserTestSetup({
 *       testName: `multi-user-test-${Date.now()}`,
 *       userCount: 3,
 *       withConnect: [true, false, true], // 1番目と3番目はConnect設定済み
 *     });
 *   });
 *
 *   afterAll(async () => {
 *     await setup.cleanup();
 *   });
 *
 *   it("複数ユーザーでテストできる", async () => {
 *     const user1 = setup.users[0];
 *     const user2 = setup.users[1];
 *     // テスト実装...
 *   });
 * });
 * ```
 */
export async function createMultiUserTestSetup(
  options: {
    testName?: string;
    userCount?: number;
    withConnect?: boolean | boolean[];
    accessedTables?: string[];
  } = {}
): Promise<MultiUserTestSetup> {
  const {
    testName = `multi-user-test-${Date.now()}`,
    userCount = 2,
    withConnect = false,
    accessedTables = ["public.users", "public.events", "public.attendances", "public.payments"],
  } = options;

  const users: TestUser[] = [];
  const connectFlags = Array.isArray(withConnect)
    ? withConnect
    : Array(userCount).fill(withConnect);

  // 複数のテストユーザーを作成
  for (let i = 0; i < userCount; i++) {
    const email = `${testName}-user${i + 1}@example.com`;
    const user = connectFlags[i]
      ? await createTestUserWithConnect(email, "TestPassword123!")
      : await createTestUser(email, "TestPassword123!");
    users.push(user);
  }

  // Supabaseクライアント取得
  const factory = SecureSupabaseClientFactory.create();
  const adminClient = await factory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `${testName} multi-user test setup`,
    {
      operationType: "SELECT",
      accessedTables,
      additionalInfo: { testContext: testName, userCount },
    }
  );

  // クリーンアップ関数
  const cleanup = async () => {
    await Promise.allSettled(users.map((user) => deleteTestUser(user.email)));
  };

  return {
    users,
    adminClient,
    cleanup,
  };
}

/**
 * テスト間データクリーンアップヘルパーを作成
 *
 * テスト間で作成されたリソース（イベント、参加、決済）を追跡し、
 * `afterEach`でクリーンアップするためのヘルパー関数です。
 *
 * **使い分け:**
 * - **`createTestDataCleanupHelper`** (この関数): テスト間（`afterEach`）でのクリーンアップに使用
 *   - イベント、参加、決済のみ（ユーザーは含まない）
 *   - より軽量で高速なクリーンアップが必要な場合
 *   - `adminClient`を直接使用して高速にクリーンアップ
 *   - 各テストで作成したリソースを`afterEach`でクリーンアップする場合に最適
 * - **`cleanupTestData`** (`common-cleanup.ts`): 特定のリソースIDを指定してクリーンアップ
 *   - イベント、参加、決済、ユーザー（指定したIDのみ）
 *   - `afterAll`で使用することが多い
 *   - 特定のリソースIDを配列で管理してクリーンアップする場合に最適
 * - **`createCleanupTracker`** (`common-cleanup.ts`): テストスイート全体（`afterAll`）でのクリーンアップに使用
 *   - ユーザーのクリーンアップも含む
 *   - より包括的なクリーンアップが必要な場合
 *   - テストスイート全体で作成したリソースを一括クリーンアップする場合に最適
 *
 * @param adminClient Supabase adminクライアント（必須）
 * @returns クリーンアップヘルパーオブジェクト
 *
 * @example
 * 基本的な使用例（テスト間クリーンアップ）
 * ```typescript
 * describe("イベント作成テスト", () => {
 *   let setup: CommonTestSetup;
 *   let cleanupHelper: TestDataCleanupHelper;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup({
 *       testName: `event-test-${Date.now()}`,
 *     });
 *     cleanupHelper = createTestDataCleanupHelper(setup.adminClient);
 *   });
 *
 *   afterAll(async () => {
 *     await setup.cleanup(); // ユーザーを削除
 *   });
 *
 *   afterEach(async () => {
 *     // テスト間データをクリーンアップ（イベント、参加、決済のみ）
 *     try {
 *       await cleanupHelper.cleanup();
 *       cleanupHelper.reset();
 *     } catch (error) {
 *       console.warn("Inter-test cleanup failed:", error);
 *     }
 *   });
 *
 *   it("イベントを作成できる", async () => {
 *     const event = await createEvent(setup.testUser.id, {
 *       title: "テストイベント",
 *     });
 *     cleanupHelper.trackEvent(event.id); // クリーンアップ対象として追跡
 *     expect(event).toBeDefined();
 *   });
 * });
 * ```
 *
 * @example
 * 複数のリソースを追跡する場合
 * ```typescript
 * describe("決済処理テスト", () => {
 *   let setup: CommonTestSetup;
 *   let cleanupHelper: TestDataCleanupHelper;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup({
 *       testName: `payment-test-${Date.now()}`,
 *       withConnect: true,
 *     });
 *     cleanupHelper = createTestDataCleanupHelper(setup.adminClient);
 *   });
 *
 *   afterAll(async () => {
 *     await setup.cleanup();
 *   });
 *
 *   afterEach(async () => {
 *     await cleanupHelper.cleanup();
 *     cleanupHelper.reset();
 *   });
 *
 *   it("決済を処理できる", async () => {
 *     const event = await createEvent(setup.testUser.id, {
 *       title: "テストイベント",
 *       fee: 1500,
 *     });
 *     cleanupHelper.trackEvent(event.id);
 *
 *     const attendance = await createAttendance(event.id, {
 *       nickname: "参加者",
 *     });
 *     cleanupHelper.trackAttendance(attendance.id);
 *
 *     const payment = await createPayment(attendance.id, {
 *       amount: 1500,
 *     });
 *     cleanupHelper.trackPayment(payment.id);
 *
 *     // afterEachで全てのリソースがクリーンアップされる
 *   });
 * });
 * ```
 */
export function createTestDataCleanupHelper(adminClient: any): TestDataCleanupHelper {
  const eventIds: string[] = [];
  const attendanceIds: string[] = [];
  const paymentIds: string[] = [];

  return {
    trackEvent: (eventId: string) => {
      eventIds.push(eventId);
    },
    trackAttendance: (attendanceId: string) => {
      attendanceIds.push(attendanceId);
    },
    trackPayment: (paymentId: string) => {
      paymentIds.push(paymentId);
    },
    cleanup: async () => {
      // 外部キー制約を考慮した削除順序: payments → attendances → events
      try {
        if (paymentIds.length > 0) {
          await adminClient.from("payments").delete().in("id", paymentIds);
        }
      } catch (error) {
        console.warn("Failed to cleanup payments:", error);
      }

      try {
        if (attendanceIds.length > 0) {
          await adminClient.from("attendances").delete().in("id", attendanceIds);
        }
      } catch (error) {
        console.warn("Failed to cleanup attendances:", error);
      }

      try {
        if (eventIds.length > 0) {
          await adminClient.from("events").delete().in("id", eventIds);
        }
      } catch (error) {
        console.warn("Failed to cleanup events:", error);
      }
    },
    reset: () => {
      eventIds.length = 0;
      attendanceIds.length = 0;
      paymentIds.length = 0;
    },
  };
}
