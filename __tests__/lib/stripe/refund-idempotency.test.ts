import { generateIdempotencyKey, stripe } from '@/lib/stripe/client';
import { createDestinationRefund } from '@/lib/stripe/destination-charges';

jest.mock('@/lib/stripe/client', () => {
  const actual = jest.requireActual('@/lib/stripe/client');
  return {
    ...actual,
    stripe: {
      refunds: {
        create: jest.fn(),
      },
      paymentIntents: {
        // not used in these tests
      },
    },
  };
});

const mockedStripe = stripe as unknown as {
  refunds: { create: jest.Mock };
};

describe('Refund Idempotency-Key generation', () => {
  it('returns same key for identical parameters', () => {
    const k1 = generateIdempotencyKey('refund', 'pi_123', 1000);
    const k2 = generateIdempotencyKey('refund', 'pi_123', 1000);
    expect(k1).toBe(k2);
  });

  it('returns different key when amount differs', () => {
    const k1 = generateIdempotencyKey('refund', 'pi_123', 1000);
    const k2 = generateIdempotencyKey('refund', 'pi_123', 2000);
    expect(k1).not.toBe(k2);
  });
});

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
});
