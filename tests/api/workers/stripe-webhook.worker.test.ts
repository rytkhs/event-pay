import { NextRequest } from "next/server";

import { POST as WorkerPOST } from "../../../app/api/workers/stripe-webhook/route";
import { webhookEventFixtures } from "../../fixtures/payment-test-fixtures";
import {
  createPaidTestEvent,
  createTestAttendance,
  createPendingTestPayment,
} from "../../helpers/test-payment-data";
import { testDataManager, createConnectTestData } from "../../setup/test-data-seeds";

// QStash Receiver.verify を常にtrueにする
const mockVerify = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

describe("/api/workers/stripe-webhook (worker)", () => {
  beforeAll(async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test_current_key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test_next_key";
  });

  afterAll(async () => {
    await testDataManager.cleanupTestData();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockResolvedValue(true);
  });

  function createRequest(body: unknown, headersInit?: Record<string, string>) {
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

  it("payment_intent.succeeded で payments が paid に更新（冪等）", async () => {
    // 個別シナリオデータを作成（重複を避けるため）
    const { activeUser } = await createConnectTestData();
    const event = await createPaidTestEvent(activeUser.id, { title: `pi_succeeded_${Date.now()}` });
    const attendance = await createTestAttendance(event.id);
    const pending = await createPendingTestPayment(attendance.id, {
      amount: 1500,
      stripeAccountId: activeUser.stripeConnectAccountId,
    });

    const evt = webhookEventFixtures.paymentIntentSucceeded();
    // metadata.payment_id をシードした pending に合わせる
    (evt.data.object as any).metadata = {
      payment_id: pending.id,
      attendance_id: attendance.id,
      event_title: event.title,
    };

    const req1 = createRequest({ event: evt });
    const res1 = await WorkerPOST(req1);
    expect(res1.status).toBe(200);

    // 冪等再送
    const req2 = createRequest({ event: evt });
    const res2 = await WorkerPOST(req2);
    expect(res2.status).toBe(200);
  });

  it("checkout.session.completed で stripe_checkout_session_id を保存", async () => {
    const { activeUser } = await createConnectTestData();
    const event = await createPaidTestEvent(activeUser.id, {
      title: `checkout_completed_${Date.now()}`,
    });
    const attendance = await createTestAttendance(event.id);
    const pending = await createPendingTestPayment(attendance.id, {
      amount: 1500,
      stripeAccountId: activeUser.stripeConnectAccountId,
    });

    const evt = webhookEventFixtures.checkoutCompleted();
    (evt.data.object as any).metadata = {
      payment_id: pending.id,
      attendance_id: attendance.id,
      event_title: event.title,
    };

    const req = createRequest({ event: evt });
    const res = await WorkerPOST(req);
    expect(res.status).toBe(200);
  });
});
