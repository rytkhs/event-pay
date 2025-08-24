/**
 * Stripe Connect Webhook API のテスト
 */

import { POST } from '@/app/api/webhooks/stripe-connect/route';
import { NextRequest } from 'next/server';
import { ConnectWebhookHandler } from '@/lib/services/webhook/connect-webhook-handler';
import { stripe } from '@/lib/stripe/client';
import { handleRateLimit } from '@/lib/rate-limit-middleware';

// モック
jest.mock('@/lib/services/webhook/connect-webhook-handler');
jest.mock('@/lib/stripe/client');
jest.mock('@/lib/rate-limit-middleware');
jest.mock('@/lib/utils/ip-detection');

// Next.js Request/Response のモック
global.Request = global.Request || class Request { };
global.Response = global.Response || class Response { };
global.Headers = global.Headers || class Headers { };

const mockConnectWebhookHandler = ConnectWebhookHandler as jest.MockedClass<typeof ConnectWebhookHandler>;
const mockHandleRateLimit = handleRateLimit as jest.MockedFunction<typeof handleRateLimit>;

describe('/api/webhooks/stripe-connect', () => {
  let mockHandler: any;

  const validWebhookPayload = JSON.stringify({
    id: 'evt_test_123',
    object: 'event',
    type: 'account.updated',
    data: {
      object: {
        id: 'acct_test_123',
        object: 'account',
        charges_enabled: true,
        payouts_enabled: true,
        metadata: {
          user_id: 'user_test_123'
        }
      }
    }
  });

  beforeEach(() => {
    // ConnectWebhookHandlerのモック
    mockHandler = {
      handleAccountUpdated: jest.fn().mockResolvedValue(undefined)
    };
    mockConnectWebhookHandler.mockImplementation(() => mockHandler);

    // Stripeのモック
    (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue({
      id: 'evt_test_123',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_123',
          charges_enabled: true,
          payouts_enabled: true,
          metadata: {
            user_id: 'user_test_123'
          }
        }
      }
    });

    // レート制限のモック（デフォルトは制限なし）
    mockHandleRateLimit.mockResolvedValue(null);

    // IP検出のモック
    const { getClientIP } = require('@/lib/utils/ip-detection');
    getClientIP.mockReturnValue('127.0.0.1');

    // 環境変数のモック（複数シークレット対応）
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test_secret';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_SECONDARY = 'whsec_test_secondary';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST', () => {
    it('有効なaccount.updatedイベントを正常に処理する', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe-connect', {
        method: 'POST',
        body: validWebhookPayload,
        headers: {
          'stripe-signature': 'valid_signature'
        }
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toEqual({
        received: true,
        eventId: 'evt_test_123',
        eventType: 'account.updated'
      });

      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        validWebhookPayload,
        'valid_signature',
        'whsec_test_secret'
      );

      expect(mockHandler.handleAccountUpdated).toHaveBeenCalledWith({
        id: 'acct_test_123',
        charges_enabled: true,
        payouts_enabled: true,
        metadata: {
          user_id: 'user_test_123'
        }
      });
    });

    it('Stripe署名が不正な場合は400エラーを返す', async () => {
      (stripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe-connect', {
        method: 'POST',
        body: validWebhookPayload,
        headers: {
          'stripe-signature': 'invalid_signature'
        }
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData).toEqual({
        error: 'Invalid signature'
      });

      expect(mockHandler.handleAccountUpdated).not.toHaveBeenCalled();
    });

    it('Stripe署名ヘッダーが欠如している場合は400エラーを返す', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe-connect', {
        method: 'POST',
        body: validWebhookPayload,
        headers: {}
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData).toEqual({
        error: 'Missing signature'
      });

      expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();
      expect(mockHandler.handleAccountUpdated).not.toHaveBeenCalled();
    });

    it('レート制限に達した場合は制限レスポンスを返す', async () => {
      const rateLimitResponse = new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        {
          status: 429,
          headers: { 'Retry-After': '60' }
        }
      );
      mockHandleRateLimit.mockResolvedValue(rateLimitResponse);

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe-connect', {
        method: 'POST',
        body: validWebhookPayload,
        headers: {
          'stripe-signature': 'valid_signature'
        }
      });

      const response = await POST(request);

      expect(response.status).toBe(429);
      expect(mockHandleRateLimit).toHaveBeenCalledWith(
        request,
        {
          windowMs: 60 * 1000,
          maxRequests: 100,
          blockDurationMs: 1000
        },
        "webhook:stripe-connect"
      );

      expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();
    });

    it('未対応のイベントタイプは無視する', async () => {
      (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue({
        id: 'evt_test_123',
        type: 'unsupported.event',
        data: {
          object: {}
        }
      });

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe-connect', {
        method: 'POST',
        body: JSON.stringify({
          id: 'evt_test_123',
          type: 'unsupported.event',
          data: { object: {} }
        }),
        headers: {
          'stripe-signature': 'valid_signature'
        }
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toEqual({
        received: true,
        eventId: 'evt_test_123',
        eventType: 'unsupported.event'
      });

      expect(mockHandler.handleAccountUpdated).not.toHaveBeenCalled();
    });

    it('ハンドラーでエラーが発生した場合は500エラーを返す', async () => {
      mockHandler.handleAccountUpdated.mockRejectedValue(new Error('Handler error'));

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe-connect', {
        method: 'POST',
        body: validWebhookPayload,
        headers: {
          'stripe-signature': 'valid_signature'
        }
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({
        error: 'Webhook handler failed'
      });

      expect(mockHandler.handleAccountUpdated).toHaveBeenCalled();
    });
  });
});
