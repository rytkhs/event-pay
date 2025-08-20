import { generateIdempotencyKey } from '@/lib/stripe/client';

describe('generateIdempotencyKey', () => {
  it('同一パラメータで同じキーを返す', () => {
    const key1 = generateIdempotencyKey('checkout', 'event_1', 'user_1', { amount: 1000, currency: 'jpy' });
    const key2 = generateIdempotencyKey('checkout', 'event_1', 'user_1', { amount: 1000, currency: 'jpy' });
    expect(key1).toBe(key2);
  });

  it('金額が異なるとキーも異なる', () => {
    const key1 = generateIdempotencyKey('checkout', 'event_1', 'user_1', { amount: 1000, currency: 'jpy' });
    const key2 = generateIdempotencyKey('checkout', 'event_1', 'user_1', { amount: 2000, currency: 'jpy' });
    expect(key1).not.toBe(key2);
  });
});
