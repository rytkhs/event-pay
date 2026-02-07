/**
 * 決済テスト用データ作成ヘルパー
 *
 * Connect設定済み/未設定ユーザー、有料イベント、pending paymentsの作成
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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
  paid_at?: string | null;
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
    stripeAccountId = `acct_test_${Math.random().toString(36).substring(2, 12)}`,
  } = options;

  const user = await createTestUser(email, password);

  const secureFactory = SecureSupabaseClientFactory.create();
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

  // 重複回避：user_id での upsert（既存があれば更新）
  const { data: connectAccount, error } = await adminClient
    .from("stripe_connect_accounts")
    .upsert(connectAccountData, { onConflict: "user_id" })
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

  const secureFactory = SecureSupabaseClientFactory.create();
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
    registration_deadline: futureDateString,
    payment_deadline: futureDateString,
    canceled_at: null,
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
  // 確実に36文字のゲストトークンを生成する関数
  const generateGuestToken = (): string => {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let result = "gst_";
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const {
    email = `test-participant-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`,
    nickname = `テスト参加者_${Math.random().toString(36).substring(2, 8)}`,
    status = "attending",
    guestToken = generateGuestToken(),
  } = options;

  const secureFactory = SecureSupabaseClientFactory.create();
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

  const secureFactory = SecureSupabaseClientFactory.create();
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

  // 既存のopenなpayment（pending/failed以外の定義に依存）がある場合の一意制約回避
  // テスト用は単純に同一attendanceのpendingを削除してから作成
  try {
    await adminClient
      .from("payments")
      .delete()
      .eq("attendance_id", attendanceId)
      .eq("status", "pending");
  } catch {
    // best-effort cleanup
  }

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
  attendanceForExistingAmount: TestAttendanceData;
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

  // 3. 参加者を作成（2つの異なる attendance を作成して、それぞれに payment を作成できるようにする）
  const [attendance, attendanceForExistingAmount] = await Promise.all([
    createTestAttendance(paidEvent.id, {
      email: `${scenarioName}-participant@example.com`,
      nickname: `${scenarioName}参加者`,
    }),
    createTestAttendance(paidEvent.id, {
      email: `${scenarioName}-participant-existing-amount@example.com`,
      nickname: `${scenarioName}参加者（既存金額）`,
    }),
  ]);

  // 4. 決済データを作成
  const [pendingPayment, existingAmountPayment] = await Promise.all([
    createPendingTestPayment(attendance.id, {
      amount: paidEvent.fee,
      stripeAccountId: userWithConnect.stripeConnectAccountId,
    }),
    createTestPaymentWithExistingAmount(attendanceForExistingAmount.id, 2000, {
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
    attendanceForExistingAmount,
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
  const secureFactory = SecureSupabaseClientFactory.create();
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

/**
 * 支払い済みのStripe決済を作成（統合テスト用）
 * - status = 'paid'
 * - paid_at を現在時刻に設定（制約対策）
 * - stripe_payment_intent_id をダミー付与（制約対策）
 * - stripe_balance_transaction_fee を指定可能（未指定時はrate計算にフォールバック）
 */
export async function createPaidStripePayment(
  attendanceId: string,
  options: {
    amount?: number;
    applicationFeeAmount?: number;
    stripeAccountId?: string;
    stripeBalanceTransactionFee?: number;
    paymentIntentId?: string;
  } = {}
): Promise<TestPaymentData> {
  const {
    amount = 1000,
    applicationFeeAmount = Math.floor(amount * 0.1),
    stripeAccountId,
    stripeBalanceTransactionFee,
    paymentIntentId = `pi_test_${Math.random().toString(36).slice(2)}`,
  } = options;

  const secureFactory = SecureSupabaseClientFactory.create();
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating PAID stripe payment for attendance: ${attendanceId}`,
    {
      operationType: "INSERT",
      accessedTables: ["public.payments"],
      additionalInfo: {
        testContext: "settlement-integration",
        attendanceId,
        amount,
      },
    }
  );

  const paymentData: PaymentInsert = {
    attendance_id: attendanceId,
    method: "stripe",
    amount,
    status: "paid",
    paid_at: new Date().toISOString(),
    stripe_payment_intent_id: paymentIntentId,
    stripe_account_id: stripeAccountId,
    application_fee_amount: applicationFeeAmount,
    // ts types may not allow null; omit the field if undefined to satisfy types
    ...(stripeBalanceTransactionFee != null
      ? { stripe_balance_transaction_fee: stripeBalanceTransactionFee }
      : {}),
    tax_included: false,
  } as PaymentInsert;

  const { data: payment, error } = await adminClient
    .from("payments")
    .insert(paymentData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create paid stripe payment: ${error.message}`);
  }

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
 * 返金データを決済に追加（統合テスト用）
 * - refunded_amount を設定し、指定されたアプリケーション手数料返金額も設定
 * - status は 'refunded' に変更
 */
export async function addRefundToPayment(
  paymentId: string,
  options: {
    refundedAmount: number;
    applicationFeeRefundedAmount?: number;
  }
): Promise<void> {
  const adminClient = await SecureSupabaseClientFactory.create().createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    "Add refund to test payment",
    { accessedTables: ["public.payments"] }
  );

  const { applicationFeeRefundedAmount = 0 } = options;

  const { error } = await adminClient
    .from("payments")
    .update({
      status: "refunded" as const,
      refunded_amount: options.refundedAmount,
      application_fee_refunded_amount: applicationFeeRefundedAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (error) {
    throw new Error(`Failed to add refund to payment: ${error.message}`);
  }
}

/**
 * 争議データを決済に作成（統合テスト用）
 * - payment_disputes テーブルにレコード挿入
 * - 'lost', 'warning_needs_response' などのステータスを設定可能
 */
export async function createPaymentDispute(
  paymentId: string,
  options: {
    amount: number;
    status?: "lost" | "warning_needs_response" | "warning_under_review" | "won" | "warning_closed";
    reason?: string;
    stripeDisputeId?: string;
    stripeAccountId?: string;
  } = { amount: 0 }
): Promise<{ id: string; dispute_id: string; amount: number; status: string }> {
  const adminClient = await SecureSupabaseClientFactory.create().createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    "Create payment dispute for test",
    { accessedTables: ["public.payment_disputes"] }
  );

  const stripeDisputeId =
    options.stripeDisputeId ??
    `dp_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const status = options.status ?? "lost";

  const disputeData = {
    payment_id: paymentId,
    amount: options.amount,
    status,
    reason: options.reason ?? "fraudulent",
    stripe_dispute_id: stripeDisputeId,
    stripe_account_id: options.stripeAccountId ?? null,
    currency: "jpy",
    created_at: new Date().toISOString(),
  };

  const { data, error } = await adminClient
    .from("payment_disputes")
    .insert(disputeData)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create payment dispute: ${error.message}`);
  }

  return { id: data.id, dispute_id: stripeDisputeId, amount: options.amount, status };
}

/**
 * 汎用的なテスト用決済を作成（複数のステータスに対応）
 *
 * @param attendanceId 参加ID
 * @param options 決済オプション
 * @returns 作成された決済データ
 */
export async function createTestPaymentWithStatus(
  attendanceId: string,
  options: {
    amount: number;
    status: Database["public"]["Enums"]["payment_status_enum"];
    method: Database["public"]["Enums"]["payment_method_enum"];
    stripePaymentIntentId?: string;
  }
): Promise<TestPaymentData> {
  const {
    amount,
    status,
    method,
    stripePaymentIntentId = method === "stripe"
      ? `pi_test_${Math.random().toString(36).substring(2, 15)}`
      : null,
  } = options;

  const secureFactory = SecureSupabaseClientFactory.create();
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating test payment with status ${status} for attendance: ${attendanceId}`,
    {
      operationType: "INSERT",
      accessedTables: ["public.payments"],
      additionalInfo: {
        testContext: "test-payment-creation",
        attendanceId,
        amount,
        status,
        method,
      },
    }
  );

  const paidAt = ["paid", "received"].includes(status) ? new Date().toISOString() : null;

  const paymentData: PaymentInsert = {
    attendance_id: attendanceId,
    amount,
    status,
    method,
    paid_at: paidAt,
    stripe_payment_intent_id: stripePaymentIntentId,
    tax_included: false,
  };

  const { data: payment, error } = await adminClient
    .from("payments")
    .insert(paymentData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test payment: ${error.message}`);
  }

  return {
    id: payment.id,
    amount: payment.amount,
    status: payment.status,
    method: payment.method,
    attendance_id: payment.attendance_id,
    application_fee_amount: payment.application_fee_amount || 0,
    stripe_account_id: payment.stripe_account_id || undefined,
  };
}

/**
 * 返金済みのStripe決済を作成（統合テスト用）
 * - status = 'refunded'
 * - refunded_amount を設定
 * - application_fee_refunded_amount を設定
 */
export async function createRefundedStripePayment(
  attendanceId: string,
  options: {
    amount?: number;
    refundedAmount?: number;
    applicationFeeAmount?: number;
    applicationFeeRefundedAmount?: number;
    stripeAccountId?: string;
    stripeBalanceTransactionFee?: number;
    paymentIntentId?: string;
  } = {}
): Promise<TestPaymentData> {
  const {
    amount = 1000,
    refundedAmount = amount, // Default: full refund
    applicationFeeAmount = Math.floor(amount * 0.1),
    applicationFeeRefundedAmount = Math.floor(refundedAmount * 0.1),
    stripeAccountId = "acct_test_refund_" + Math.random().toString(36).slice(2, 8),
    stripeBalanceTransactionFee,
    paymentIntentId = "pi_refund_" + Math.random().toString(36).slice(2, 12),
  } = options;

  const paymentData: PaymentInsert = {
    attendance_id: attendanceId,
    method: "stripe" as const,
    amount,
    status: "refunded" as const,
    paid_at: new Date(Date.now() - 60000).toISOString(), // 1分前に支払い
    refunded_amount: refundedAmount,
    stripe_payment_intent_id: paymentIntentId,
    stripe_account_id: stripeAccountId,
    application_fee_amount: applicationFeeAmount,
    application_fee_refunded_amount: applicationFeeRefundedAmount,
    ...(stripeBalanceTransactionFee != null
      ? { stripe_balance_transaction_fee: stripeBalanceTransactionFee }
      : {}),
    tax_included: false,
  };

  const adminClient = await SecureSupabaseClientFactory.create().createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    "Create refunded payment for test",
    { accessedTables: ["public.payments"] }
  );

  const { data, error } = await adminClient
    .from("payments")
    .insert(paymentData)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create refunded payment: ${error.message}`);
  }

  const paymentId = data.id;
  return {
    id: paymentId,
    amount: paymentData.amount,
    status: paymentData.status as Database["public"]["Enums"]["payment_status_enum"],
    method: paymentData.method,
    attendance_id: paymentData.attendance_id,
    application_fee_amount: paymentData.application_fee_amount || 0,
    stripe_account_id: paymentData.stripe_account_id || undefined,
  };
}

/**
 * ダッシュボード統計テスト用: 簡易イベント作成
 *
 * AdminClientを使用してイベントを作成し、作成したIDを配列に追加する
 * dashboard-stats.integration.test.ts で使用される簡易版
 */
export async function createEventForDashboardStats(
  adminClient: SupabaseClient<Database>,
  createdBy: string,
  createdEventIds: string[],
  options: {
    title: string;
    date: string;
    fee: number;
    canceled_at?: string | null;
  }
): Promise<Database["public"]["Tables"]["events"]["Row"]> {
  const eventDate = new Date(options.date);
  const registrationDeadline = new Date(eventDate.getTime() - 12 * 60 * 60 * 1000);
  const paymentDeadline = new Date(eventDate.getTime() - 6 * 60 * 60 * 1000);

  const { data: event, error } = await adminClient
    .from("events")
    .insert({
      title: options.title,
      date: options.date,
      fee: options.fee,
      created_by: createdBy,
      registration_deadline: registrationDeadline.toISOString(),
      payment_deadline: options.fee > 0 ? paymentDeadline.toISOString() : null,
      payment_methods: options.fee > 0 ? ["stripe"] : [],
      canceled_at: options.canceled_at || null,
      invite_token: `test-token-${Date.now()}-${Math.random()}`,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create event: ${error.message}`);
  }

  createdEventIds.push(event.id);
  return event;
}

/**
 * ダッシュボード統計テスト用: 簡易参加者作成
 *
 * AdminClientを使用して参加者を作成し、作成したIDを配列に追加する
 * dashboard-stats.integration.test.ts で使用される簡易版
 */
export async function createAttendanceForDashboardStats(
  adminClient: SupabaseClient<Database>,
  eventId: string,
  createdAttendanceIds: string[],
  status: "attending" | "not_attending" | "maybe",
  nickname: string
): Promise<Database["public"]["Tables"]["attendances"]["Row"]> {
  // emailを生成（正規表現制約に適合する形式）
  const randomId = Math.random().toString(36).substring(2, 12);
  const email = `test${randomId}@example.com`;

  // guest_tokenを36文字（gst_ + 32文字）に適合させる
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let randomStr = "";
  for (let i = 0; i < 32; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const guestToken = `gst_${randomStr}`;

  const { data: attendance, error } = await adminClient
    .from("attendances")
    .insert({
      event_id: eventId,
      email: email,
      nickname: nickname,
      status: status,
      guest_token: guestToken,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create attendance: ${error.message}`);
  }

  createdAttendanceIds.push(attendance.id);
  return attendance;
}

/**
 * ダッシュボード統計テスト用: 簡易決済作成
 *
 * AdminClientを使用して決済を作成し、作成したIDを配列に追加する
 * dashboard-stats.integration.test.ts で使用される簡易版
 */
export async function createPaymentForDashboardStats(
  adminClient: SupabaseClient<Database>,
  attendanceId: string,
  createdPaymentIds: string[],
  amount: number,
  status: "paid" | "received" | "pending" | "failed",
  method: "stripe" | "cash"
): Promise<Database["public"]["Tables"]["payments"]["Row"]> {
  // statusが"paid"または"received"の場合はpaid_atを設定
  const paidAt = ["paid", "received"].includes(status) ? new Date().toISOString() : null;

  // Stripe決済の場合はstripe_payment_intent_idが必須
  const stripePaymentIntentId =
    method === "stripe" ? `pi_test_${Math.random().toString(36).substring(2, 15)}` : null;

  const { data: payment, error } = await adminClient
    .from("payments")
    .insert({
      attendance_id: attendanceId,
      amount: amount,
      status: status,
      method: method,
      paid_at: paidAt,
      stripe_payment_intent_id: stripePaymentIntentId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create payment: ${error.message}`);
  }

  createdPaymentIds.push(payment.id);
  return payment;
}
