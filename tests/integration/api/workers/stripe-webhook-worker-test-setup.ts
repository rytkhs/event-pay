/**
 * Stripe Webhook Worker テスト共通セットアップ
 *
 * 共通セットアップ関数を使用してリファクタリング済み
 * 動的シナリオ機能を維持しつつ、QStash環境変数の設定を共通化
 */

import { NextRequest } from "next/server";

import {
  createPendingTestPayment,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "@/tests/helpers/test-payment-data";
import { createPaymentTestSetup } from "@/tests/setup/common-test-setup";

// QStash Receiver.verify を常にtrueにする
const mockVerify = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

export interface StripeWebhookWorkerTestSetup {
  cleanup: () => Promise<void>;
  createRequest: (body: unknown, headersInit?: Record<string, string>) => NextRequest;
  createTestScenario: () => Promise<{
    activeUser: any;
    event: any;
    attendance: any;
    pending: any;
  }>;
}

export async function setupStripeWebhookWorkerTest(): Promise<StripeWebhookWorkerTestSetup> {
  // QStash環境変数の設定（createWebhookTestSetupと同様の設定）
  // 注意: 動的シナリオ機能を使用するため、createWebhookTestSetupは使用せず、
  // 環境変数の設定のみを共通化
  process.env.QSTASH_CURRENT_SIGNING_KEY = "test_current_key";
  process.env.QSTASH_NEXT_SIGNING_KEY = "test_next_key";

  const createdSetups: Array<Awaited<ReturnType<typeof createPaymentTestSetup>>> = [];

  const cleanup = async () => {
    // 作成されたセットアップをクリーンアップ
    for (const setup of createdSetups) {
      await setup.cleanup();
    }
    createdSetups.length = 0;
  };

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

  async function createTestScenario(): Promise<{
    activeUser: TestPaymentUser;
    event: TestPaymentEvent;
    attendance: TestAttendanceData;
    pending: any;
  }> {
    // 共通決済テストセットアップを使用（動的シナリオ作成）
    const paymentSetup = await createPaymentTestSetup({
      testName: `webhook-worker-test-${Date.now()}`,
      eventFee: 1500,
      paymentMethods: ["stripe"],
      accessedTables: ["public.payments", "public.attendances", "public.events"],
    });

    // クリーンアップ用に記録
    createdSetups.push(paymentSetup);

    const pending = await createPendingTestPayment(paymentSetup.testAttendance.id, {
      amount: 1500,
      stripeAccountId: paymentSetup.testUser.stripeConnectAccountId,
    });

    return {
      activeUser: paymentSetup.testUser,
      event: paymentSetup.testEvent,
      attendance: paymentSetup.testAttendance,
      pending,
    };
  }

  return {
    cleanup,
    createRequest,
    createTestScenario,
  };
}

export function setupBeforeEach() {
  mockVerify.mockResolvedValue(true);
}
