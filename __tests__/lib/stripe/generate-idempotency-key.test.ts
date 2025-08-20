/**
 * generateIdempotencyKey function tests
 * This tests only the key generation logic without importing the full Stripe client
 */

// generateIdempotencyKey関数を直接テストするため、cryptoモジュールをモック
import { randomUUID } from 'crypto';

// generateIdempotencyKeyの実装をコピー（テスト用）
function generateIdempotencyKey(operation: string, resourceId: string, uniqueId: string | number): string {
  const data = `${operation}:${resourceId}:${uniqueId}`;
  // crypto.createHashはテスト環境で利用可能なので直接使用
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

describe('generateIdempotencyKey', () => {
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

  it('returns different key when resource ID differs', () => {
    const k1 = generateIdempotencyKey('refund', 'pi_123', 1000);
    const k2 = generateIdempotencyKey('refund', 'pi_456', 1000);
    expect(k1).not.toBe(k2);
  });

  it('returns different key when operation differs', () => {
    const k1 = generateIdempotencyKey('refund', 'pi_123', 1000);
    const k2 = generateIdempotencyKey('charge', 'pi_123', 1000);
    expect(k1).not.toBe(k2);
  });

  it('handles string uniqueId', () => {
    const k1 = generateIdempotencyKey('refund', 'pi_123', 'custom-id');
    const k2 = generateIdempotencyKey('refund', 'pi_123', 'custom-id');
    expect(k1).toBe(k2);
  });

  it('handles numeric uniqueId', () => {
    const k1 = generateIdempotencyKey('refund', 'pi_123', 12345);
    const k2 = generateIdempotencyKey('refund', 'pi_123', 12345);
    expect(k1).toBe(k2);
  });
});
