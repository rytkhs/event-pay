/**
 * 決済テスト用データ作成ヘルパー
 *
 * Connect設定済み/未設定ユーザー、有料イベント、pending paymentsの作成
 */

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { generateInviteToken } from "@core/utils/invite-token";

import type { Database } from "@/types/database";

import { createTestUser, type TestUser } from "./test-user";

// 型定義
type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
type AttendanceInsert = Database["public"]["Tables"]["attendances"]["Insert"];
type StripeConnectAccountInsert = Database["public"]["Tables"]["stripe_connect_accounts"]["Insert"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

export interface TestPaymentUser extends TestUser {
  hasStripeConnect: boolean;
  stripeConnectAccountId?: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
}

export interface TestPaymentEvent {
  id: string;
  title: string;
  date: string;
  fee: number;
  capacity: number | null;
  invite_token: string;
  created_by: string;
  payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
}

export interface TestPaymentData {
  id: string;
  amount: number;
  status: Database["public"]["Enums"]["payment_status_enum"];
  method: Database["public"]["Enums"]["payment_method_enum"];
  attendance_id: string;
  application_fee_amount: number;
  stripe_account_id?: string;
}

export interface TestAttendanceData {
  id: string;
  event_id: string;
  email: string;
  nickname: string;
  status: Database["public"]["Enums"]["attendance_status_enum"];
  guest_token: string;
}

/**
 * Connect未設定のテストユーザーを作成
 */
export async function createTestUserWithoutConnect(
  email: string = `test-no-connect-${Date.now()}@example.com`,
  password: string = "TestPassword123!"
): Promise<TestPaymentUser> {
  const user = await createTestUser(email, password);

  return {
    ...user,
    hasStripeConnect: false,
    payoutsEnabled: false,
    chargesEnabled: false,
  };
}

/**
 * Connect設定済みのテストユーザーを作成
 */
export async function createTestUserWithConnect(
  email: string = `test-with-connect-${Date.now()}@example.com`,
  password: string = "TestPassword123!",
  options: {
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
    stripeAccountId?: string;
  } = {}
): Promise<TestPaymentUser> {
  const {
    payoutsEnabled = true,
    chargesEnabled = true,
    stripeAccountId = "acct_1RwIFbCZwTLGDVBd",
  } = options;

  const user = await createTestUser(email, password);

  const secureFactory = SecureSupabaseClientFactory.getInstance();
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating Stripe Connect account for test user: ${email}`,
    {
      operationType: "INSERT",
      accessedTables: ["public.stripe_connect_accounts"],
      additionalInfo: {
        testContext: "payment-test-setup",
        userId: user.id,
        stripeAccountId,
      },
    }
  );

  // Stripe Connect アカウントを作成
  const connectAccountData: StripeConnectAccountInsert = {
    user_id: user.id,
    stripe_account_id: stripeAccountId,
    payouts_enabled: payoutsEnabled,
    charges_enabled: chargesEnabled,
    status: payoutsEnabled && chargesEnabled ? "verified" : "onboarding",
  };

  const { data: connectAccount, error } = await adminClient
    .from("stripe_connect_accounts")
    .insert(connectAccountData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create Stripe Connect account: ${error.message}`);
  }

  // eslint-disable-next-line no-console
  console.log(`✓ Created Stripe Connect account for user ${email}: ${stripeAccountId}`);

  return {
    ...user,
    hasStripeConnect: true,
    stripeConnectAccountId: connectAccount.stripe_account_id,
    payoutsEnabled: connectAccount.payouts_enabled,
    chargesEnabled: connectAccount.charges_enabled,
  };
}

/**
 * payouts_enabled=falseのテストユーザーを作成
 */
export async function createTestUserWithDisabledPayouts(
  email: string = `test-payouts-disabled-${Date.now()}@example.com`,
  password: string = "TestPassword123!"
): Promise<TestPaymentUser> {
  return createTestUserWithConnect(email, password, {
    payoutsEnabled: false,
    chargesEnabled: true,
  });
}

/**
 * 有料テストイベントを作成
 */
export async function createPaidTestEvent(
  createdBy: string,
  options: {
    fee?: number;
    capacity?: number | null;
    title?: string;
    paymentMethods?: Database["public"]["Enums"]["payment_method_enum"][];
  } = {}
): Promise<TestPaymentEvent> {
  const {
    fee = 1000,
    capacity = null,
    title = `有料テストイベント（${fee}円）`,
    paymentMethods = ["stripe"],
  } = options;

  const secureFactory = SecureSupabaseClientFactory.getInstance();
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating paid test event for payment tests`,
    {
      operationType: "INSERT",
      accessedTables: ["public.events"],
      additionalInfo: {
        testContext: "payment-test-setup",
        createdBy,
        fee,
      },
    }
  );

  // 将来の日時を生成（現在時刻から1時間後）
  const futureDate = new Date(Date.now() + 60 * 60 * 1000);
  const futureDateString = futureDate.toISOString();

  // 招待トークンを生成
  const inviteToken = generateInviteToken();

  const eventData: EventInsert = {
    title,
    date: futureDateString,
    location: "テスト会場",
    description: "決済テスト用の有料イベントです",
    fee,
    capacity,
    payment_methods: paymentMethods,
    registration_deadline: null,
    payment_deadline: null,
    status: "upcoming",
    invite_token: inviteToken,
    created_by: createdBy,
  };

  const { data: createdEvent, error } = await adminClient
    .from("events")
    .insert(eventData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create paid test event: ${error.message}`);
  }

  // eslint-disable-next-line no-console
  console.log(`✓ Created paid test event: ${title} (${fee}円, ID: ${createdEvent.id})`);

  return {
    id: createdEvent.id,
    title: createdEvent.title,
    date: createdEvent.date,
    fee: createdEvent.fee,
    capacity: createdEvent.capacity,
    invite_token: createdEvent.invite_token || "",
    created_by: createdEvent.created_by,
    payment_methods: createdEvent.payment_methods || [],
  };
}

/**
 * テスト用参加者を作成
 */
export async function createTestAttendance(
  eventId: string,
  options: {
    email?: string;
    nickname?: string;
    status?: Database["public"]["Enums"]["attendance_status_enum"];
    guestToken?: string;
  } = {}
): Promise<TestAttendanceData> {
  const {
    email = `test-participant-${Date.now()}@example.com`,
    nickname = `テスト参加者_${Math.random().toString(36).substring(2, 8)}`,
    status = "attending",
    guestToken = `guest_token_${Math.random().toString(36).substring(2, 15)}`,
  } = options;

  const secureFactory = SecureSupabaseClientFactory.getInstance();
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating test attendance for event: ${eventId}`,
    {
      operationType: "INSERT",
      accessedTables: ["public.attendances"],
      additionalInfo: {
        testContext: "payment-test-setup",
        eventId,
        email,
      },
    }
  );

  const attendanceData: AttendanceInsert = {
    event_id: eventId,
    email,
    nickname,
    status,
    guest_token: guestToken,
  };

  const { data: attendance, error } = await adminClient
    .from("attendances")
    .insert(attendanceData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test attendance: ${error.message}`);
  }

  // eslint-disable-next-line no-console
  console.log(`✓ Created test attendance: ${email} for event ${eventId}`);

  return {
    id: attendance.id,
    event_id: attendance.event_id,
    email: attendance.email,
    nickname: attendance.nickname,
    status: attendance.status,
    guest_token: attendance.guest_token,
  };
}

/**
 * pending状態のテスト用決済を作成
 */
export async function createPendingTestPayment(
  attendanceId: string,
  options: {
    amount?: number;
    method?: Database["public"]["Enums"]["payment_method_enum"];
    stripeAccountId?: string;
    applicationFeeAmount?: number;
  } = {}
): Promise<TestPaymentData> {
  const {
    amount = 1000,
    method = "stripe",
    stripeAccountId = undefined,
    applicationFeeAmount = Math.floor(amount * 0.1), // デフォルト10%
  } = options;

  const secureFactory = SecureSupabaseClientFactory.getInstance();
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating pending test payment for attendance: ${attendanceId}`,
    {
      operationType: "INSERT",
      accessedTables: ["public.payments"],
      additionalInfo: {
        testContext: "payment-test-setup",
        attendanceId,
        amount,
      },
    }
  );

  const paymentData: PaymentInsert = {
    attendance_id: attendanceId,
    amount,
    status: "pending",
    method,
    application_fee_amount: applicationFeeAmount,
    stripe_account_id: stripeAccountId,
    tax_included: false,
  };

  const { data: payment, error } = await adminClient
    .from("payments")
    .insert(paymentData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create pending test payment: ${error.message}`);
  }

  // eslint-disable-next-line no-console
  console.log(`✓ Created pending test payment: ${amount}円 for attendance ${attendanceId}`);

  return {
    id: payment.id,
    amount: payment.amount,
    status: payment.status,
    method: payment.method,
    attendance_id: payment.attendance_id,
    application_fee_amount: payment.application_fee_amount,
    stripe_account_id: payment.stripe_account_id,
  };
}

/**
 * 既存のamountを持つテスト用決済を作成（上書きテスト用）
 */
export async function createTestPaymentWithExistingAmount(
  attendanceId: string,
  existingAmount: number,
  options: {
    method?: Database["public"]["Enums"]["payment_method_enum"];
    stripeAccountId?: string;
  } = {}
): Promise<TestPaymentData> {
  const { method = "stripe", stripeAccountId = undefined } = options;

  return createPendingTestPayment(attendanceId, {
    amount: existingAmount,
    method,
    stripeAccountId,
    applicationFeeAmount: Math.floor(existingAmount * 0.1),
  });
}

/**
 * 完全なテストシナリオセットを作成
 */
export async function createCompleteTestScenario(scenarioName: string = "payment-test"): Promise<{
  userWithConnect: TestPaymentUser;
  userWithoutConnect: TestPaymentUser;
  userWithDisabledPayouts: TestPaymentUser;
  paidEvent: TestPaymentEvent;
  freeEvent: TestPaymentEvent;
  attendance: TestAttendanceData;
  pendingPayment: TestPaymentData;
  existingAmountPayment: TestPaymentData;
}> {
  // eslint-disable-next-line no-console
  console.log(`🚀 Creating complete test scenario: ${scenarioName}`);

  // 1. テストユーザーを作成
  const [userWithConnect, userWithoutConnect, userWithDisabledPayouts] = await Promise.all([
    createTestUserWithConnect(`${scenarioName}-with-connect@example.com`),
    createTestUserWithoutConnect(`${scenarioName}-no-connect@example.com`),
    createTestUserWithDisabledPayouts(`${scenarioName}-disabled-payouts@example.com`),
  ]);

  // 2. テストイベントを作成
  const [paidEvent, freeEvent] = await Promise.all([
    createPaidTestEvent(userWithConnect.id, {
      title: `${scenarioName} 有料イベント`,
      fee: 1500,
    }),
    createPaidTestEvent(userWithConnect.id, {
      title: `${scenarioName} 無料イベント`,
      fee: 0,
      paymentMethods: [],
    }),
  ]);

  // 3. 参加者を作成
  const attendance = await createTestAttendance(paidEvent.id, {
    email: `${scenarioName}-participant@example.com`,
    nickname: `${scenarioName}参加者`,
  });

  // 4. 決済データを作成
  const [pendingPayment, existingAmountPayment] = await Promise.all([
    createPendingTestPayment(attendance.id, {
      amount: paidEvent.fee,
      stripeAccountId: userWithConnect.stripeConnectAccountId,
    }),
    createTestPaymentWithExistingAmount(attendance.id, 2000, {
      stripeAccountId: userWithConnect.stripeConnectAccountId,
    }),
  ]);

  // eslint-disable-next-line no-console
  console.log(`✅ Complete test scenario created: ${scenarioName}`);

  return {
    userWithConnect,
    userWithoutConnect,
    userWithDisabledPayouts,
    paidEvent,
    freeEvent,
    attendance,
    pendingPayment,
    existingAmountPayment,
  };
}

/**
 * テストデータをクリーンアップ
 */
export async function cleanupTestPaymentData(dataIds: {
  paymentIds?: string[];
  attendanceIds?: string[];
  eventIds?: string[];
  userIds?: string[];
}): Promise<void> {
  const secureFactory = SecureSupabaseClientFactory.getInstance();
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_CLEANUP,
    "Cleaning up payment test data",
    {
      operationType: "DELETE",
      accessedTables: [
        "public.payments",
        "public.attendances",
        "public.events",
        "public.stripe_connect_accounts",
      ],
      additionalInfo: {
        testContext: "payment-test-cleanup",
        dataIds,
      },
    }
  );

  try {
    // 決済データを削除
    if (dataIds.paymentIds?.length) {
      await adminClient.from("payments").delete().in("id", dataIds.paymentIds);
      // eslint-disable-next-line no-console
      console.log(`✓ Deleted ${dataIds.paymentIds.length} test payments`);
    }

    // 参加者データを削除
    if (dataIds.attendanceIds?.length) {
      await adminClient.from("attendances").delete().in("id", dataIds.attendanceIds);
      // eslint-disable-next-line no-console
      console.log(`✓ Deleted ${dataIds.attendanceIds.length} test attendances`);
    }

    // イベントデータを削除
    if (dataIds.eventIds?.length) {
      await adminClient.from("events").delete().in("id", dataIds.eventIds);
      // eslint-disable-next-line no-console
      console.log(`✓ Deleted ${dataIds.eventIds.length} test events`);
    }

    // Connect アカウントを削除
    if (dataIds.userIds?.length) {
      await adminClient.from("stripe_connect_accounts").delete().in("user_id", dataIds.userIds);
      // eslint-disable-next-line no-console
      console.log(`✓ Deleted Stripe Connect accounts for ${dataIds.userIds.length} users`);
    }
  } catch (error) {
    console.error("Error during test data cleanup:", error);
    throw error;
  }
}

/**
 * Stripe テストカード情報
 */
export const TEST_CARD_NUMBERS = {
  // 成功する決済
  VISA_SUCCESS: "4242424242424242",
  MASTERCARD_SUCCESS: "5555555555554444",

  // エラーパターン
  CARD_DECLINED: "4000000000000002",
  INSUFFICIENT_FUNDS: "4000000000009995",
  EXPIRED_CARD: "4000000000000069",
  INCORRECT_CVC: "4000000000000127",
  PROCESSING_ERROR: "4000000000000119",

  // 3D Secure
  REQUIRES_3DS: "4000002760003184",

  // その他
  ALWAYS_AUTHENTICATE: "4000002500003155",
} as const;

/**
 * テスト用の決済金額パターン
 */
export const TEST_PAYMENT_AMOUNTS = {
  SMALL: 500, // 500円
  MEDIUM: 1000, // 1,000円
  LARGE: 5000, // 5,000円
  VERY_LARGE: 10000, // 10,000円
} as const;
