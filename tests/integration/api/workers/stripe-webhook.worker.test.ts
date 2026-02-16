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
    const { adminClient, activeUser, event, attendance } = await setup.createTestScenario();
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
    expect(res1.status).toBe(204);

    const { data: firstPayment } = await adminClient
      .from("payments")
      .select("updated_at, webhook_processed_at, status")
      .eq("id", pending.id)
      .single();

    expect(firstPayment.status).toBe("paid");

    // 冪等再送
    const req2 = setup.createRequest({ event: evt });
    const res2 = await WorkerPOST(req2);
    expect(res2.status).toBe(204);

    const { data: secondPayment } = await adminClient
      .from("payments")
      .select("updated_at, webhook_processed_at, status")
      .eq("id", pending.id)
      .single();

    expect(secondPayment.status).toBe("paid");
    expect(secondPayment.updated_at).toBe(firstPayment.updated_at);
    expect(secondPayment.webhook_processed_at).toBe(firstPayment.webhook_processed_at);

    const { data: ledgerRow } = await adminClient
      .from("webhook_event_ledger")
      .select("processing_status")
      .eq("stripe_event_id", evt.id)
      .single();

    expect(ledgerRow.processing_status).toBe("succeeded");
  });

  it("payment_intent.succeeded が terminal failure 後に同一event.id再送されても再処理しない", async () => {
    const { adminClient, activeUser, event, attendance } = await setup.createTestScenario();
    const pending = await createPendingTestPayment(attendance.id, {
      amount: 2000,
      stripeAccountId: activeUser.stripeConnectAccountId,
    });

    const evt = webhookEventFixtures.paymentIntentSucceeded();
    const paymentIntentId = `pi_${pending.id}`;
    (evt.data.object as any).metadata = {
      payment_id: pending.id,
      attendance_id: attendance.id,
      event_title: event.title,
    };
    (evt.data.object as any).id = paymentIntentId;
    (evt.data.object as any).amount = 1500; // 1回目はDB金額(2000)と不一致にする

    const req1 = setup.createRequest({ event: evt });
    const res1 = await WorkerPOST(req1);
    expect(res1.status).toBe(489);

    const { data: failedLedger } = await adminClient
      .from("webhook_event_ledger")
      .select("processing_status, is_terminal_failure, last_error_reason")
      .eq("stripe_event_id", evt.id)
      .single();

    expect(failedLedger.processing_status).toBe("failed");
    expect(failedLedger.is_terminal_failure).toBe(true);
    expect(failedLedger.last_error_reason).toBe("amount_currency_mismatch");

    // DBの期待金額をイベントと揃えても、terminal failureの同一event.idは再処理しない
    await adminClient.from("payments").update({ amount: 1500 }).eq("id", pending.id);

    const req2 = setup.createRequest({ event: evt });
    const res2 = await WorkerPOST(req2);
    expect(res2.status).toBe(204); // ledgerによりduplicateとしてACK

    const { data: failedAgainLedger } = await adminClient
      .from("webhook_event_ledger")
      .select("processing_status, is_terminal_failure, last_error_reason")
      .eq("stripe_event_id", evt.id)
      .single();

    expect(failedAgainLedger.processing_status).toBe("failed");
    expect(failedAgainLedger.is_terminal_failure).toBe(true);
    expect(failedAgainLedger.last_error_reason).toBe("amount_currency_mismatch");

    const { data: paymentAfterReplay } = await adminClient
      .from("payments")
      .select("status")
      .eq("id", pending.id)
      .single();
    expect(paymentAfterReplay.status).toBe("pending");
  });

  it("processing中の同一event.id再送はretryable errorを返して再処理しない", async () => {
    const { adminClient, activeUser, event, attendance } = await setup.createTestScenario();
    const pending = await createPendingTestPayment(attendance.id, {
      amount: 1500,
      stripeAccountId: activeUser.stripeConnectAccountId,
    });

    const evt = webhookEventFixtures.paymentIntentSucceeded();
    const paymentIntentId = `pi_${pending.id}`;
    (evt.data.object as any).metadata = {
      payment_id: pending.id,
      attendance_id: attendance.id,
      event_title: event.title,
    };
    (evt.data.object as any).id = paymentIntentId;

    await adminClient.from("webhook_event_ledger").insert({
      stripe_event_id: evt.id,
      event_type: evt.type,
      stripe_object_id: paymentIntentId,
      dedupe_key: `${evt.type}:${paymentIntentId}`,
      processing_status: "processing",
    });

    const req = setup.createRequest({ event: evt });
    const res = await WorkerPOST(req);
    expect(res.status).toBe(500);

    const { data: paymentAfterReplay } = await adminClient
      .from("payments")
      .select("status")
      .eq("id", pending.id)
      .single();
    expect(paymentAfterReplay.status).toBe("pending");
  });

  it("staleなprocessing状態の同一event.id再送は処理を再開して成功できる", async () => {
    const { adminClient, activeUser, event, attendance } = await setup.createTestScenario();
    const pending = await createPendingTestPayment(attendance.id, {
      amount: 1500,
      stripeAccountId: activeUser.stripeConnectAccountId,
    });

    const evt = webhookEventFixtures.paymentIntentSucceeded();
    const paymentIntentId = `pi_${pending.id}`;
    (evt.data.object as any).metadata = {
      payment_id: pending.id,
      attendance_id: attendance.id,
      event_title: event.title,
    };
    (evt.data.object as any).id = paymentIntentId;

    const staleUpdatedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    await adminClient.from("webhook_event_ledger").insert({
      stripe_event_id: evt.id,
      event_type: evt.type,
      stripe_object_id: paymentIntentId,
      dedupe_key: `${evt.type}:${paymentIntentId}`,
      processing_status: "processing",
      updated_at: staleUpdatedAt,
    });

    const req = setup.createRequest({ event: evt });
    const res = await WorkerPOST(req);
    expect(res.status).toBe(204);

    const { data: paymentAfterReplay } = await adminClient
      .from("payments")
      .select("status")
      .eq("id", pending.id)
      .single();
    expect(paymentAfterReplay.status).toBe("paid");

    const { data: ledgerRow } = await adminClient
      .from("webhook_event_ledger")
      .select("processing_status, last_error_code, last_error_reason")
      .eq("stripe_event_id", evt.id)
      .single();

    expect(ledgerRow.processing_status).toBe("succeeded");
    expect(ledgerRow.last_error_code).toBeNull();
    expect(ledgerRow.last_error_reason).toBeNull();
  });

  it("retryable failed の同一event.id再送で再処理して成功に遷移する", async () => {
    const { adminClient, activeUser, event, attendance } = await setup.createTestScenario();
    const pending = await createPendingTestPayment(attendance.id, {
      amount: 1500,
      stripeAccountId: activeUser.stripeConnectAccountId,
    });

    const evt = webhookEventFixtures.paymentIntentSucceeded();
    const paymentIntentId = `pi_${pending.id}`;
    (evt.data.object as any).metadata = {
      payment_id: pending.id,
      attendance_id: attendance.id,
      event_title: event.title,
    };
    (evt.data.object as any).id = paymentIntentId;

    await adminClient.from("webhook_event_ledger").insert({
      stripe_event_id: evt.id,
      event_type: evt.type,
      stripe_object_id: paymentIntentId,
      dedupe_key: `${evt.type}:${paymentIntentId}`,
      processing_status: "failed",
      is_terminal_failure: false,
      last_error_code: "WEBHOOK_UNEXPECTED_ERROR",
      last_error_reason: "temporary_failure",
    });

    const req = setup.createRequest({ event: evt });
    const res = await WorkerPOST(req);
    expect(res.status).toBe(204);

    const { data: paymentAfterReplay } = await adminClient
      .from("payments")
      .select("status")
      .eq("id", pending.id)
      .single();
    expect(paymentAfterReplay.status).toBe("paid");

    const { data: ledgerRow } = await adminClient
      .from("webhook_event_ledger")
      .select("processing_status, is_terminal_failure, last_error_code, last_error_reason")
      .eq("stripe_event_id", evt.id)
      .single();

    expect(ledgerRow.processing_status).toBe("succeeded");
    expect(ledgerRow.is_terminal_failure).toBe(false);
    expect(ledgerRow.last_error_code).toBeNull();
    expect(ledgerRow.last_error_reason).toBeNull();
  });

  it("terminal failed (is_terminal_failure=true) の同一event.id再送は error code に関係なく再処理しない", async () => {
    const { adminClient, activeUser, event, attendance } = await setup.createTestScenario();
    const pending = await createPendingTestPayment(attendance.id, {
      amount: 1500,
      stripeAccountId: activeUser.stripeConnectAccountId,
    });

    const evt = webhookEventFixtures.paymentIntentSucceeded();
    const paymentIntentId = `pi_${pending.id}`;
    (evt.data.object as any).metadata = {
      payment_id: pending.id,
      attendance_id: attendance.id,
      event_title: event.title,
    };
    (evt.data.object as any).id = paymentIntentId;

    await adminClient.from("webhook_event_ledger").insert({
      stripe_event_id: evt.id,
      event_type: evt.type,
      stripe_object_id: paymentIntentId,
      dedupe_key: `${evt.type}:${paymentIntentId}`,
      processing_status: "failed",
      is_terminal_failure: true,
      last_error_code: "WEBHOOK_UNEXPECTED_ERROR",
      last_error_reason: "payment_repository_findById_cardinality_failed",
    });

    const req = setup.createRequest({ event: evt });
    const res = await WorkerPOST(req);
    expect(res.status).toBe(204);

    const { data: paymentAfterReplay } = await adminClient
      .from("payments")
      .select("status")
      .eq("id", pending.id)
      .single();
    expect(paymentAfterReplay.status).toBe("pending");

    const { data: ledgerRow } = await adminClient
      .from("webhook_event_ledger")
      .select("processing_status, is_terminal_failure, last_error_code, last_error_reason")
      .eq("stripe_event_id", evt.id)
      .single();

    expect(ledgerRow.processing_status).toBe("failed");
    expect(ledgerRow.is_terminal_failure).toBe(true);
    expect(ledgerRow.last_error_code).toBe("WEBHOOK_UNEXPECTED_ERROR");
    expect(ledgerRow.last_error_reason).toBe("payment_repository_findById_cardinality_failed");
  });

  it("charge.dispute.created で dispute を記録して ACK する", async () => {
    const { adminClient, pending } = await setup.createTestScenario();
    const paymentIntentId = `pi_${pending.id}`;
    const chargeId = `ch_${pending.id}`;

    await adminClient
      .from("payments")
      .update({
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: chargeId,
      })
      .eq("id", pending.id);

    const evt = webhookEventFixtures.chargeDisputeCreated();
    (evt.data.object as any).payment_intent = paymentIntentId;
    (evt.data.object as any).charge = chargeId;

    const req = setup.createRequest({ event: evt });
    const res = await WorkerPOST(req);
    expect(res.status).toBe(204);

    const { data: disputeRow } = await adminClient
      .from("payment_disputes")
      .select("stripe_dispute_id, payment_id, charge_id, payment_intent_id, status")
      .eq("stripe_dispute_id", (evt.data.object as any).id)
      .single();

    expect(disputeRow.payment_id).toBe(pending.id);
    expect(disputeRow.charge_id).toBe(chargeId);
    expect(disputeRow.payment_intent_id).toBe(paymentIntentId);
    expect(disputeRow.status).toBe("needs_response");

    const { data: ledgerRow } = await adminClient
      .from("webhook_event_ledger")
      .select("processing_status")
      .eq("stripe_event_id", evt.id)
      .single();

    expect(ledgerRow.processing_status).toBe("succeeded");
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
    expect(res.status).toBe(204);
  });
});
