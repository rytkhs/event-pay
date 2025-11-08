/**
 * payment_intent.succeeded Webhook テスト共通セットアップ
 *
 * 共通セットアップ関数と統一モック設定を使用してリファクタリング済み
 */

import { NextRequest } from "next/server";

import { setupLoggerMocks } from "@tests/setup/common-mocks";
import { createWebhookTestSetup } from "@tests/setup/common-test-setup";

import { webhookEventFixtures } from "@/tests/fixtures/payment-test-fixtures";
import type {
  TestAttendanceData,
  TestPaymentEvent,
  TestPaymentUser,
} from "@/tests/helpers/test-payment-data";

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

export interface PaymentIntentSucceededTestSetup {
  supabase: any;
  testUser: TestPaymentUser;
  testEvent: TestPaymentEvent;
  testAttendance: TestAttendanceData;
  cleanup: () => Promise<void>;
  createRequest: (body: unknown, headersInit?: Record<string, string>) => NextRequest;
  createPaymentIntentEvent: (
    paymentIntentId: string,
    overrides?: Partial<{
      amount: number;
      currency: string;
      metadata: Record<string, string>;
    }>
  ) => any;
}

export async function setupPaymentIntentSucceededTest(): Promise<PaymentIntentSucceededTestSetup> {
  // ロガーモックを設定
  setupLoggerMocks();

  // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
  const webhookSetup = await createWebhookTestSetup({
    testName: `payment-intent-succeeded-test-${Date.now()}`,
    eventFee: 1500,
    accessedTables: ["public.payments", "public.attendances", "public.events"],
  });

  // 後方互換性のため、supabaseという名前でエクスポート
  const supabase = webhookSetup.adminClient;

  function createRequest(body: unknown, headersInit?: Record<string, string>): NextRequest {
    const url = new URL("http://localhost/api/workers/stripe-webhook");
    const headers = new Headers({
      "Upstash-Signature": "sig_test",
      "Upstash-Delivery-Id": "deliv_test_123",
      ...headersInit,
    });
    return new NextRequest(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  function createPaymentIntentEvent(
    paymentIntentId: string,
    overrides: Partial<{
      amount: number;
      currency: string;
      metadata: Record<string, string>;
    }> = {}
  ): any {
    const evt = webhookEventFixtures.paymentIntentSucceeded();
    const paymentIntent = evt.data.object as any;
    paymentIntent.id = paymentIntentId;
    paymentIntent.amount = overrides.amount ?? 1500;
    paymentIntent.currency = overrides.currency ?? "jpy";
    paymentIntent.metadata = overrides.metadata ?? {
      payment_id: "will_be_set_in_test",
      attendance_id: webhookSetup.testAttendance.id,
      event_title: webhookSetup.testEvent.title,
    };
    return evt;
  }

  return {
    supabase,
    testUser: webhookSetup.testUser,
    testEvent: webhookSetup.testEvent,
    testAttendance: webhookSetup.testAttendance,
    cleanup: webhookSetup.cleanup,
    createRequest,
    createPaymentIntentEvent,
  };
}

export function setupBeforeEach() {
  mockVerify.mockResolvedValue(true);
}
