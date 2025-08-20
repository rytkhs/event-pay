/**
 * Destination charges機能のテスト
 */

import { describe, it, expect } from '@jest/globals';
import { transferGroupUtils } from '../destination-charges';

describe('Destination charges', () => {
  describe('transferGroupUtils', () => {
    it('イベント用のTransfer Groupを生成する', () => {
      const result = transferGroupUtils.generateEventTransferGroup('event_123');
      expect(result).toBe('event_event_123_payout');
    });

    it('Transfer GroupからイベントIDを抽出する', () => {
      const result = transferGroupUtils.extractEventIdFromTransferGroup('event_event_123_payout');
      expect(result).toBe('event_123');
    });

    it('無効なTransfer Groupの場合はnullを返す', () => {
      const result = transferGroupUtils.extractEventIdFromTransferGroup('invalid_format');
      expect(result).toBeNull();
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
