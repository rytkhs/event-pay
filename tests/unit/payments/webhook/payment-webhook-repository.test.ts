import {
  PaymentWebhookRepository,
  PaymentWebhookRepositoryError,
} from "@features/payments/services/webhook/repositories/payment-webhook-repository";

function createReadClient(maybeSingleResult: unknown) {
  const maybeSingle = jest.fn().mockResolvedValue(maybeSingleResult);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });

  return {
    client: { from } as any,
    from,
    select,
    eq,
    maybeSingle,
  };
}

function createWriteClient() {
  const eq = jest.fn().mockResolvedValue({ data: null, error: null });
  const update = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ update });

  return {
    client: { from } as any,
    from,
    update,
    eq,
  };
}

describe("PaymentWebhookRepository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("cardinality系エラーは terminal=true/category=cardinality として扱う", async () => {
    const dbError = {
      code: "PGRST116",
      message: "JSON object requested, multiple rows returned",
      details: "Results contain 2 rows",
      hint: null,
    };
    const mock = createReadClient({ data: null, error: dbError });
    const repository = new PaymentWebhookRepository(mock.client);

    await expect(repository.findByStripeChargeId("ch_1")).rejects.toMatchObject({
      name: "PaymentWebhookRepositoryError",
      operation: "findByStripeChargeId",
      code: "PGRST116",
      category: "cardinality",
      terminal: true,
    });
  });

  it("timeout系エラーは terminal=false/category=transient として扱う", async () => {
    const dbError = {
      code: "57014",
      message: "canceling statement due to statement timeout",
      details: null,
      hint: null,
    };
    const mock = createReadClient({ data: null, error: dbError });
    const repository = new PaymentWebhookRepository(mock.client);

    await expect(repository.findById("pay_1")).rejects.toMatchObject({
      name: "PaymentWebhookRepositoryError",
      operation: "findById",
      code: "57014",
      category: "transient",
      terminal: false,
    });
  });

  it("22/23クラスは integrity terminal 扱いになる", async () => {
    const dbError = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details: null,
      hint: null,
    };
    const mock = createReadClient({ data: null, error: dbError });
    const repository = new PaymentWebhookRepository(mock.client);

    await expect(repository.findByCheckoutSessionId("cs_1")).rejects.toMatchObject({
      name: "PaymentWebhookRepositoryError",
      operation: "findByCheckoutSessionId",
      code: "23505",
      category: "integrity",
      terminal: true,
    });
  });

  it("read query は select('*') を使わず必要カラムだけ取得する", async () => {
    const mock = createReadClient({ data: null, error: null });
    const repository = new PaymentWebhookRepository(mock.client);

    await repository.findByApplicationFeeId("fee_1");

    expect(mock.from).toHaveBeenCalledWith("payments");
    const selectedColumns = mock.select.mock.calls[0][0] as string;
    expect(selectedColumns).not.toContain("*");
    expect(selectedColumns).toContain("id");
    expect(selectedColumns).toContain("status");
    expect(selectedColumns).toContain("application_fee_refunded_amount");
  });

  it("unknownエラーでも PaymentWebhookRepositoryError として返す", async () => {
    const dbError = {
      code: null,
      message: "unexpected failure",
      details: null,
      hint: null,
    };
    const mock = createReadClient({ data: null, error: dbError });
    const repository = new PaymentWebhookRepository(mock.client);

    await expect(repository.findByStripePaymentIntentId("pi_1")).rejects.toBeInstanceOf(
      PaymentWebhookRepositoryError
    );
  });

  it("resolveByChargeOrFallback は PI -> Charge -> metadata の順で探索する", async () => {
    const repository = new PaymentWebhookRepository({} as any);
    const byPi = { id: "pay_by_pi" } as any;
    const byCharge = { id: "pay_by_charge" } as any;
    const byId = { id: "pay_by_id" } as any;
    const findByPi = jest
      .spyOn(repository, "findByStripePaymentIntentId")
      .mockResolvedValueOnce(byPi)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const findByCharge = jest
      .spyOn(repository, "findByStripeChargeId")
      .mockResolvedValueOnce(byCharge)
      .mockResolvedValueOnce(null);
    const findById = jest.spyOn(repository, "findById").mockResolvedValue(byId);

    const piWinner = await repository.resolveByChargeOrFallback({
      paymentIntentId: "pi_1",
      chargeId: "ch_1",
      metadataPaymentId: "pay_1",
    });
    expect(piWinner).toBe(byPi);

    const chargeWinner = await repository.resolveByChargeOrFallback({
      paymentIntentId: "pi_2",
      chargeId: "ch_2",
      metadataPaymentId: "pay_2",
    });
    expect(chargeWinner).toBe(byCharge);

    const metadataWinner = await repository.resolveByChargeOrFallback({
      paymentIntentId: "pi_3",
      chargeId: "ch_3",
      metadataPaymentId: "pay_3",
    });
    expect(metadataWinner).toBe(byId);

    expect(findByPi).toHaveBeenNthCalledWith(1, "pi_1");
    expect(findByPi).toHaveBeenNthCalledWith(2, "pi_2");
    expect(findByPi).toHaveBeenNthCalledWith(3, "pi_3");
    expect(findByCharge).toHaveBeenNthCalledWith(1, "ch_2");
    expect(findByCharge).toHaveBeenNthCalledWith(2, "ch_3");
    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith("pay_3");
  });

  it("saveCheckoutSessionLink は checkout session を保存し paymentId で更新する", async () => {
    const mock = createWriteClient();
    const repository = new PaymentWebhookRepository(mock.client);

    await repository.saveCheckoutSessionLink({
      paymentId: "pay_1",
      sessionId: "cs_1",
      paymentIntentId: null,
    });

    const payload = mock.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      stripe_checkout_session_id: "cs_1",
      updated_at: expect.any(String),
    });
    expect(payload).not.toHaveProperty("stripe_payment_intent_id");
    expect(mock.eq).toHaveBeenCalledWith("id", "pay_1");
  });

  it("updateRefundAggregate は返金集計の必須項目をまとめて更新する", async () => {
    const mock = createWriteClient();
    const repository = new PaymentWebhookRepository(mock.client);

    await repository.updateRefundAggregate({
      paymentId: "pay_2",
      eventId: "evt_1",
      chargeId: "ch_1",
      paymentIntentId: "pi_1",
      status: "refunded",
      refundedAmount: 1500,
      applicationFeeRefundedAmount: 120,
      applicationFeeRefundId: "fr_1",
    });

    const payload = mock.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      status: "refunded",
      refunded_amount: 1500,
      application_fee_refunded_amount: 120,
      application_fee_refund_id: "fr_1",
      stripe_charge_id: "ch_1",
      stripe_payment_intent_id: "pi_1",
      webhook_event_id: "evt_1",
      webhook_processed_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(mock.eq).toHaveBeenCalledWith("id", "pay_2");
  });
});
