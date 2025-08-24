import { createDestinationRefund } from "@/lib/stripe/destination-charges";

jest.mock("@/lib/stripe/client", () => {
  const refunds = { create: jest.fn() };
  return {
    stripe: {
      refunds,
      paymentIntents: { retrieve: jest.fn() },
    },
    generateIdempotencyKey: jest.fn(() => "mocked-key"),
    createStripeRequestOptions: jest.fn(() => ({})),
  };
});

const { stripe: mockedStripe } = jest.requireMock("@/lib/stripe/client");

describe('createDestinationRefund retry logic', () => {
  beforeEach(() => {
    mockedStripe.refunds.create.mockReset();
  });

  it('retries once on idempotency_key_in_use and succeeds', async () => {
    mockedStripe.refunds.create
      .mockRejectedValueOnce({ code: 'idempotency_key_in_use', statusCode: 409 })
      .mockResolvedValueOnce({ id: 're_123' });

    const refund = await createDestinationRefund({ paymentIntentId: 'pi_123' });
    expect(refund).toEqual({ id: 're_123' });
    expect(mockedStripe.refunds.create).toHaveBeenCalledTimes(2);
  });

  it('uses provided refundId for idempotency key generation', async () => {
    mockedStripe.refunds.create.mockResolvedValue({ id: 're_456' });

    const refundId = 'custom-refund-id';
    await createDestinationRefund({
      paymentIntentId: 'pi_123',
      refundId
    });

    expect(mockedStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          refund_id: refundId,
        }),
      }),
      expect.any(Object)
    );
  });

  it('generates consistent idempotency keys for same refundId', async () => {
    mockedStripe.refunds.create.mockResolvedValue({ id: 're_789' });

    const refundId = 'consistent-refund-id';

    await createDestinationRefund({ paymentIntentId: 'pi_123', refundId });
    await createDestinationRefund({ paymentIntentId: 'pi_123', refundId });

    const calls = mockedStripe.refunds.create.mock.calls;
    expect(calls[0][0].metadata.refund_id).toBe(refundId);
    expect(calls[1][0].metadata.refund_id).toBe(refundId);
  });

  it('generates new UUID when no refundId provided', async () => {
    mockedStripe.refunds.create.mockResolvedValue({ id: 're_999' });

    await createDestinationRefund({ paymentIntentId: 'pi_123' });

    const call = mockedStripe.refunds.create.mock.calls[0][0];
    expect(call.metadata.refund_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('prioritizes refundId parameter over metadata.refund_id', async () => {
    mockedStripe.refunds.create.mockResolvedValue({ id: 're_888' });

    const explicitRefundId = 'explicit-refund-id';
    const metadataRefundId = 'metadata-refund-id';

    await createDestinationRefund({
      paymentIntentId: 'pi_123',
      refundId: explicitRefundId,
      metadata: { refund_id: metadataRefundId }
    });

    const call = mockedStripe.refunds.create.mock.calls[0][0];
    expect(call.metadata.refund_id).toBe(explicitRefundId);
  });
});
