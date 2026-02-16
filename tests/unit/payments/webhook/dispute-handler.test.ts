import type Stripe from "stripe";

import { DisputeHandler } from "../../../../features/payments/services/webhook/handlers/dispute-handler";
import { PaymentWebhookRepositoryError } from "../../../../features/payments/services/webhook/repositories/payment-webhook-repository";

describe("DisputeHandler", () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockPaymentRepository = {
    resolveForDispute: jest.fn(),
  };

  const mockDisputeRepository = {
    upsertDisputeRecord: jest.fn(),
  };

  const mockSettlementRegenerationService = {
    regenerateSettlementSnapshotFromPayment: jest.fn(),
  };

  const disputeEvent = {
    id: "evt_dispute_1",
    type: "charge.dispute.created",
    account: "acct_123",
    data: {
      object: {
        object: "dispute",
        id: "dp_123",
        charge: "ch_123",
        payment_intent: "pi_123",
        status: "needs_response",
        amount: 1000,
        currency: "jpy",
      },
    },
  } as unknown as Stripe.Event;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDisputeRepository.upsertDisputeRecord.mockResolvedValue({ error: null });
    mockSettlementRegenerationService.regenerateSettlementSnapshotFromPayment.mockResolvedValue(
      undefined
    );
  });

  it("payment repository の terminal error を握りつぶさずに throw する", async () => {
    const terminalRepoError = new PaymentWebhookRepositoryError({
      operation: "findByStripeChargeId",
      message: "multiple rows found",
      code: "PGRST116",
      category: "cardinality",
      terminal: true,
    });
    mockPaymentRepository.resolveForDispute.mockRejectedValue(terminalRepoError);

    const handler = new DisputeHandler({
      paymentRepository: mockPaymentRepository as never,
      disputeRepository: mockDisputeRepository as never,
      settlementRegenerationService: mockSettlementRegenerationService as never,
      logger: mockLogger as never,
    });

    await expect(handler.handleEvent(disputeEvent)).rejects.toBe(terminalRepoError);
    expect(mockDisputeRepository.upsertDisputeRecord).not.toHaveBeenCalled();
  });
});
