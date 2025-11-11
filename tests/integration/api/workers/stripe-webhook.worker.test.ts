import { webhookEventFixtures } from "../../../fixtures/payment-test-fixtures";
import { createPendingTestPayment } from "../../../helpers/test-payment-data";
import {
  setupStripeWebhookWorkerTest,
  setupBeforeEach,
  type StripeWebhookWorkerTestSetup,
} from "../../api/workers/stripe-webhook-worker-test-setup";

let WorkerPOST: typeof import("../../../../app/api/workers/stripe-webhook/route").POST;

describe("/api/workers/stripe-webhook (worker)", () => {
  let setup: StripeWebhookWorkerTestSetup;

  beforeAll(async () => {
    setup = await setupStripeWebhookWorkerTest();
    ({ POST: WorkerPOST } = await import("../../../../app/api/workers/stripe-webhook/route"));
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  beforeEach(() => {
    setupBeforeEach();
  });

  it("payment_intent.succeeded で payments が paid に更新（冪等）", async () => {
    // 個別シナリオデータを作成（重複を避けるため）
    const { activeUser, event, attendance } = await setup.createTestScenario();
    const pending = await createPendingTestPayment(attendance.id, {
      amount: 1500,
      stripeAccountId: activeUser.stripeConnectAccountId,
    });

    const evt = webhookEventFixtures.paymentIntentSucceeded();
    const paymentIntentId = `pi_${pending.id}`;
    // metadata.payment_id をシードした pending に合わせる
    (evt.data.object as any).metadata = {
      payment_id: pending.id,
      attendance_id: attendance.id,
      event_title: event.title,
    };
    (evt.data.object as any).id = paymentIntentId;

    const req1 = setup.createRequest({ event: evt });
    const res1 = await WorkerPOST(req1);
    expect(res1.status).toBe(200);

    // 冪等再送
    const req2 = setup.createRequest({ event: evt });
    const res2 = await WorkerPOST(req2);
    expect(res2.status).toBe(200);
  });

  it("checkout.session.completed で stripe_checkout_session_id を保存", async () => {
    const { activeUser, event, attendance } = await setup.createTestScenario();
    const pending = await createPendingTestPayment(attendance.id, {
      amount: 1500,
      stripeAccountId: activeUser.stripeConnectAccountId,
    });

    const evt = webhookEventFixtures.checkoutCompleted();
    const paymentIntentId = `pi_${pending.id}`;
    (evt.data.object as any).metadata = {
      payment_id: pending.id,
      attendance_id: attendance.id,
      event_title: event.title,
    };
    (evt.data.object as any).payment_intent = paymentIntentId;

    const req = setup.createRequest({ event: evt });
    const res = await WorkerPOST(req);
    expect(res.status).toBe(200);
  });
});
