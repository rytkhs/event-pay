/**
 * Destination charges機能のテスト
 */

import { describe, it, expect } from '@jest/globals';
import { getTransferGroupForEvent } from '@/lib/utils/stripe';

describe('Destination charges', () => {
  describe('getTransferGroupForEvent', () => {
    it('イベント用のTransfer Groupを生成する', () => {
      const result = getTransferGroupForEvent('event_123');
      expect(result).toBe('event_event_123_payout');
    });
  });

  describe('generateIdempotencyKey', () => {
    it('checkout 用の Idempotency Key を生成する', () => {
      const { generateIdempotencyKey } = jest.requireActual('../client');
      const result = generateIdempotencyKey('checkout', 'event_123', 'user_456');
      expect(result).toBe('checkout:event_123:user_456');
    });

    it('payment_intent 用の Idempotency Key を生成する', () => {
      const { generateIdempotencyKey } = jest.requireActual('../client');
      const result = generateIdempotencyKey('payment_intent', 'event_123', 'user_456');
      expect(result).toBe('pi:event_123:user_456');
    });
  });
});
