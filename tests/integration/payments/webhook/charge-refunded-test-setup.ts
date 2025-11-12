/**
 * charge.refunded Webhook テスト共通セットアップ
 *
 * 共通セットアップ関数と統一モック設定を使用してリファクタリング済み
 */

import { NextRequest } from "next/server";

import { setupLoggerMocks } from "@tests/setup/common-mocks";
import { createWebhookTestSetup } from "@tests/setup/common-test-setup";

import {
  createTestAttendance,
  createPaidTestEvent,
  type TestAttendanceData,
  type TestPaymentEvent,
} from "@/tests/helpers/test-payment-data";
import { cleanupTestData } from "@/tests/setup/common-cleanup";

// QStash Receiver.verify を常にtrueにする
const mockVerify = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

// ログの出力をキャプチャするためのモック
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// ロガーモックをエクスポート（既存のテストで使用されているため）
export const mockLoggerInfo = jest.fn();
export const mockLoggerWarn = jest.fn();

export interface ChargeRefundedTestSetup {
  supabase: any;
  testUser: any;
  testEvent: TestPaymentEvent;
  testAttendance: TestAttendanceData;
  cleanup: () => Promise<void>;
  createRequest: (body: unknown, headersInit?: Record<string, string>) => NextRequest;
  createChargeRefundedEvent: (
    chargeId: string,
    overrides?: Partial<{
      amount: number;
      amountRefunded: number;
      currency: string;
      paymentIntent: string;
      metadata: Record<string, string>;
      applicationFeeRefund?: { id: string; amount: number } | null;
    }>
  ) => any;
  createPaidPayment: (
    attendanceId: string,
    options: {
      amount: number;
      paymentIntentId?: string;
      chargeId?: string;
      applicationFeeAmount?: number;
      stripeBalanceTransactionFee?: number;
    }
  ) => Promise<{
    id: string;
    attendance_id: string;
    method: "stripe";
    amount: number;
    status: "paid";
    paid_at: string;
    stripe_payment_intent_id: string;
    stripe_charge_id: string;
    stripe_account_id: string | undefined;
    application_fee_amount: number;
    stripe_balance_transaction_fee: number;
    tax_included: boolean;
  }>;
  createIsolatedEventWithAttendance: (options?: { title?: string; fee?: number }) => Promise<{
    event: TestPaymentEvent;
    attendance: TestAttendanceData;
  }>;
}

export async function setupChargeRefundedTest(): Promise<ChargeRefundedTestSetup> {
  // ロガーモックを設定
  setupLoggerMocks();

  // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
  const webhookSetup = await createWebhookTestSetup({
    testName: `charge-refunded-test-${Date.now()}`,
    eventFee: 1500,
    accessedTables: ["public.payments", "public.attendances", "public.events"],
  });

  // 後方互換性のため、supabaseという名前でエクスポート
  const supabase = webhookSetup.adminClient;
  const testUser = webhookSetup.testUser;
  const testEvent = webhookSetup.testEvent;
  const testAttendance = webhookSetup.testAttendance;

  // 分離されたイベントと参加レコードを追跡（クリーンアップ用）
  const isolatedData: Array<{
    eventId: string;
    attendanceId: string;
  }> = [];

  // クリーンアップ関数を拡張（分離されたデータもクリーンアップ）
  const cleanup = async () => {
    // 分離されたイベントと参加レコードをクリーンアップ
    const isolatedAttendanceIds = isolatedData.map((d) => d.attendanceId);
    const isolatedEventIds = isolatedData.map((d) => d.eventId);

    // 分離されたデータがある場合は、先にクリーンアップ（共通クリーンアップ関数を使用）
    if (isolatedAttendanceIds.length > 0 || isolatedEventIds.length > 0) {
      await cleanupTestData({
        attendanceIds: isolatedAttendanceIds,
        eventIds: isolatedEventIds,
        // 分離されたデータは同じユーザーなので、共通クリーンアップで処理
      });
    }

    // 共通クリーンアップを実行（testEvent、testAttendance、testUserをクリーンアップ）
    await cleanupTestData({
      attendanceIds: [testAttendance.id],
      eventIds: [testEvent.id],
      userEmails: [testUser.email],
    });
  };

  function createRequest(body: unknown, headersInit?: Record<string, string>): NextRequest {
    const url = new URL("http://localhost/api/workers/stripe-webhook");
    const headers = new Headers({
      "Upstash-Signature": "sig_test",
      "Upstash-Delivery-Id": `deliv_test_${Date.now()}`,
      ...headersInit,
    });
    return new NextRequest(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  /**
   * charge.refunded イベントを作成
   */
  function createChargeRefundedEvent(
    chargeId: string,
    overrides: Partial<{
      amount: number;
      amountRefunded: number;
      currency: string;
      paymentIntent: string;
      metadata: Record<string, string>;
      applicationFeeRefund?: { id: string; amount: number } | null;
    }> = {}
  ): any {
    const evt = {
      id: `evt_test_refund_${Date.now()}`,
      object: "event",
      type: "charge.refunded",
      api_version: "2023-10-16",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: {
        object: {
          id: chargeId,
          object: "charge",
          amount: overrides.amount ?? 1500,
          amount_refunded: overrides.amountRefunded ?? overrides.amount ?? 1500,
          currency: overrides.currency ?? "jpy",
          payment_intent: overrides.paymentIntent ?? `pi_test_${Date.now()}`,
          refunded: true,
          metadata: overrides.metadata ?? {},
          ...(overrides.applicationFeeRefund
            ? { application_fee_refund: overrides.applicationFeeRefund }
            : {}),
        },
      },
    };
    return evt;
  }

  /**
   * 決済済みのテスト決済レコードを作成
   */
  async function createPaidPayment(
    attendanceId: string,
    options: {
      amount: number;
      paymentIntentId?: string;
      chargeId?: string;
      applicationFeeAmount?: number;
      stripeBalanceTransactionFee?: number;
    }
  ): Promise<{
    id: string;
    attendance_id: string;
    method: "stripe";
    amount: number;
    status: "paid";
    paid_at: string;
    stripe_payment_intent_id: string;
    stripe_charge_id: string;
    stripe_account_id: string | undefined;
    application_fee_amount: number;
    stripe_balance_transaction_fee: number;
    tax_included: boolean;
  }> {
    const {
      amount,
      paymentIntentId = `pi_refund_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      chargeId = `ch_refund_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      applicationFeeAmount = Math.floor(amount * 0.1),
      stripeBalanceTransactionFee = Math.floor(amount * 0.036 + 100),
    } = options;

    const paymentData = {
      attendance_id: attendanceId,
      method: "stripe" as const,
      amount,
      status: "paid" as const,
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      stripe_account_id: testUser.stripeConnectAccountId,
      application_fee_amount: applicationFeeAmount,
      stripe_balance_transaction_fee: stripeBalanceTransactionFee,
      tax_included: false,
    };

    const { data, error } = await supabase
      .from("payments")
      .insert(paymentData)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Failed to create paid payment: ${error?.message ?? "Unknown error"}`);
    }

    return {
      id: data.id,
      ...paymentData,
    };
  }

  /**
   * 分離されたイベントと参加レコードを作成（前のテストの影響を避けるため）
   */
  async function createIsolatedEventWithAttendance(options?: {
    title?: string;
    fee?: number;
  }): Promise<{
    event: TestPaymentEvent;
    attendance: TestAttendanceData;
  }> {
    const isolatedEvent = await createPaidTestEvent(webhookSetup.testUser.id, {
      title: options?.title ?? `Isolated Refund Test ${Date.now()}`,
      fee: options?.fee ?? 1500,
    });
    const isolatedAttendance = await createTestAttendance(isolatedEvent.id);

    // クリーンアップ用に追跡
    isolatedData.push({
      eventId: isolatedEvent.id,
      attendanceId: isolatedAttendance.id,
    });

    return {
      event: isolatedEvent,
      attendance: isolatedAttendance,
    };
  }

  return {
    supabase,
    testUser,
    testEvent,
    testAttendance,
    cleanup,
    createRequest,
    createChargeRefundedEvent,
    createPaidPayment,
    createIsolatedEventWithAttendance,
  };
}

export function setupBeforeEach() {
  mockVerify.mockResolvedValue(true);
}
