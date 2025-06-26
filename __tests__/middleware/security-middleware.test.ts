/**
 * セキュリティミドルウェア統合テスト
 * middleware.tsのセキュリティ機能の包括的テスト
 */

import { NextRequest, NextResponse } from 'next/server';
import { middleware } from '@/middleware';

// モックの設定
jest.mock('@/lib/supabase/middleware');
jest.mock('@/lib/auth/cookie-manager');
jest.mock('@/lib/security/csrf');

const mockCreateClient = jest.fn();
const mockClearAllSupabaseCookies = jest.fn();
const mockIsStateChangingRequest = jest.fn();
const mockGetCSRFTokenFromRequest = jest.fn();
const mockValidateCSRFToken = jest.fn();
const mockGenerateCSRFToken = jest.fn();
const mockSetCSRFTokenCookie = jest.fn();
const mockCreateCSRFErrorResponse = jest.fn();

// モジュールモック
require('@/lib/supabase/middleware').createClient = mockCreateClient;
require('@/lib/auth/cookie-manager').clearAllSupabaseCookies = mockClearAllSupabaseCookies;
require('@/lib/security/csrf').isStateChangingRequest = mockIsStateChangingRequest;
require('@/lib/security/csrf').getCSRFTokenFromRequest = mockGetCSRFTokenFromRequest;
require('@/lib/security/csrf').validateCSRFToken = mockValidateCSRFToken;
require('@/lib/security/csrf').generateCSRFToken = mockGenerateCSRFToken;
require('@/lib/security/csrf').setCSRFTokenCookie = mockSetCSRFTokenCookie;
require('@/lib/security/csrf').createCSRFErrorResponse = mockCreateCSRFErrorResponse;

describe('セキュリティミドルウェア統合テスト', () => {
  let mockSupabaseClient: any;

  beforeEach(() => {
    mockSupabaseClient = {
      auth: {
        getUser: jest.fn(),
      },
    };

    mockCreateClient.mockReturnValue({
      supabase: mockSupabaseClient,
      supabaseResponse: null,
    });

    // デフォルトモック設定
    mockClearAllSupabaseCookies.mockImplementation((response) => response);
    mockIsStateChangingRequest.mockReturnValue(false);
    mockGetCSRFTokenFromRequest.mockReturnValue({
      headerToken: 'valid-header-token',
      cookieToken: 'valid-cookie-token',
    });
    mockValidateCSRFToken.mockReturnValue(true);
    mockGenerateCSRFToken.mockReturnValue('new-csrf-token');
    mockSetCSRFTokenCookie.mockImplementation((response) => response);
    mockCreateCSRFErrorResponse.mockReturnValue(
      new NextResponse(JSON.stringify({ error: 'CSRF error' }), { status: 403 })
    );

    jest.clearAllMocks();
  });

  describe('静的アセットとNext.js内部ルート', () => {
    test('_nextパスがスキップされる', async () => {
      const request = new NextRequest('http://localhost:3000/_next/static/file.js');
      const response = await middleware(request);

      expect(response).toBeInstanceOf(NextResponse);
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    test('faviconがスキップされる', async () => {
      const request = new NextRequest('http://localhost:3000/favicon.ico');
      const response = await middleware(request);

      expect(response).toBeInstanceOf(NextResponse);
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    test('.well-knownパスがスキップされる', async () => {
      const request = new NextRequest('http://localhost:3000/.well-known/security.txt');
      const response = await middleware(request);

      expect(response).toBeInstanceOf(NextResponse);
      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });

  describe('CSRF保護機能', () => {
    test('状態変更リクエストでCSRFトークンが検証される', async () => {
      mockIsStateChangingRequest.mockReturnValue(true);
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/events', {
        method: 'POST',
      });

      await middleware(request);

      expect(mockIsStateChangingRequest).toHaveBeenCalledWith(request);
      expect(mockGetCSRFTokenFromRequest).toHaveBeenCalledWith(request);
      expect(mockValidateCSRFToken).toHaveBeenCalledWith(
        'valid-header-token',
        'valid-cookie-token'
      );
    });

    test('CSRFトークンが存在しない場合エラーが返される', async () => {
      mockIsStateChangingRequest.mockReturnValue(true);
      mockGetCSRFTokenFromRequest.mockReturnValue({
        headerToken: null,
        cookieToken: null,
      });

      const request = new NextRequest('http://localhost:3000/api/events', {
        method: 'POST',
      });

      const response = await middleware(request);

      expect(mockCreateCSRFErrorResponse).toHaveBeenCalledWith(
        'CSRF token is required for state-changing operations'
      );
    });

    test('無効なCSRFトークンでエラーが返される', async () => {
      mockIsStateChangingRequest.mockReturnValue(true);
      mockValidateCSRFToken.mockReturnValue(false);

      const request = new NextRequest('http://localhost:3000/api/events', {
        method: 'POST',
      });

      const response = await middleware(request);

      expect(mockCreateCSRFErrorResponse).toHaveBeenCalledWith('Invalid CSRF token');
    });

    test('CSRF除外ルートでは検証がスキップされる', async () => {
      mockIsStateChangingRequest.mockReturnValue(true);
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
      });

      await middleware(request);

      expect(mockGetCSRFTokenFromRequest).not.toHaveBeenCalled();
      expect(mockValidateCSRFToken).not.toHaveBeenCalled();
    });

    test('認証済みユーザーでCSRFトークンが生成される', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/dashboard', {
        headers: { Cookie: '' }, // CSRFトークンなし
      });

      await middleware(request);

      expect(mockGenerateCSRFToken).toHaveBeenCalled();
      expect(mockSetCSRFTokenCookie).toHaveBeenCalled();
    });
  });

  describe('認証フロー', () => {
    test('認証済みユーザーがダッシュボードにアクセスできる', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/dashboard');
      const response = await middleware(request);

      expect(response).toBeInstanceOf(NextResponse);
      expect(response.status).not.toBe(401);
    });

    test('未認証ユーザーが保護されたルートでリダイレクトされる', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/dashboard');
      const response = await middleware(request);

      expect(response).toBeInstanceOf(NextResponse);
      expect(response.status).toBe(307); // リダイレクト
      expect(response.headers.get('location')).toContain('/auth/login');
    });

    test('未認証ユーザーがAPIルートで401エラーを受ける', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/events');
      const response = await middleware(request);

      expect(response.status).toBe(401);
      
      const body = await response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    test('認証済みユーザーが認証ページからダッシュボードにリダイレクトされる', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/auth/login');
      const response = await middleware(request);

      expect(response.status).toBe(307); // リダイレクト
      expect(response.headers.get('location')).toContain('/dashboard');
    });
  });

  describe('セッション管理', () => {
    test('無効なセッションでCookieが削除される', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid session' },
      });

      const request = new NextRequest('http://localhost:3000/dashboard');
      await middleware(request);

      expect(mockClearAllSupabaseCookies).toHaveBeenCalled();
    });

    test('有効なセッションでCookieが保持される', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/dashboard');
      await middleware(request);

      expect(mockClearAllSupabaseCookies).not.toHaveBeenCalled();
    });
  });

  describe('セキュリティヘッダー', () => {
    test('セキュリティヘッダーが適切に設定される', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/');
      const response = await middleware(request);

      // セキュリティヘッダーの存在確認
      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    test('本番環境でHSTSヘッダーが設定される', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/');
      const response = await middleware(request);

      expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');

      process.env.NODE_ENV = originalEnv;
    });

    test('CSPヘッダーに適切なディレクティブが含まれる', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/');
      const response = await middleware(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline' https://js.stripe.com");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("form-action 'self'");
    });
  });

  describe('エラーハンドリング', () => {
    test('Supabaseエラーで安全にフォールバックする', async () => {
      mockCreateClient.mockImplementation(() => {
        throw new Error('Supabase connection failed');
      });

      const request = new NextRequest('http://localhost:3000/dashboard');
      const response = await middleware(request);

      // 保護されたルートはログインページにリダイレクト
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/auth/login');
    });

    test('APIルートエラーで500が返される', async () => {
      mockCreateClient.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const request = new NextRequest('http://localhost:3000/api/events');
      const response = await middleware(request);

      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    test('CSRF検証エラーが適切に処理される', async () => {
      mockIsStateChangingRequest.mockReturnValue(true);
      mockValidateCSRFToken.mockImplementation(() => {
        throw new Error('CSRF validation failed');
      });

      const request = new NextRequest('http://localhost:3000/api/events', {
        method: 'POST',
      });

      // エラーが発生してもミドルウェアが停止しないことを確認
      const response = await middleware(request);
      expect(response).toBeInstanceOf(NextResponse);
    });
  });

  describe('ルーティング制御', () => {
    test('公開ルートが適切に処理される', async () => {
      const publicRoutes = [
        '/',
        '/auth/login',
        '/auth/register',
        '/auth/reset-password',
        '/attend/event-123',
        '/api/auth/login',
        '/api/webhooks/stripe',
      ];

      for (const route of publicRoutes) {
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: null,
        });

        const request = new NextRequest(`http://localhost:3000${route}`);
        const response = await middleware(request);

        // 公開ルートは認証なしでアクセス可能
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(307); // リダイレクトされない
      }
    });

    test('保護されたルートが適切に制御される', async () => {
      const protectedRoutes = [
        '/dashboard',
        '/events',
        '/events/create',
        '/api/events',
        '/api/payments',
      ];

      for (const route of protectedRoutes) {
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: null,
        });

        const request = new NextRequest(`http://localhost:3000${route}`);
        const response = await middleware(request);

        // 保護されたルートは認証が必要
        if (route.startsWith('/api/')) {
          expect(response.status).toBe(401);
        } else {
          expect(response.status).toBe(307); // ログインページにリダイレクト
        }
      }
    });
  });

  describe('パフォーマンス', () => {
    test('大量のリクエストでパフォーマンス劣化がない', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const startTime = performance.now();

      // 100回のミドルウェア実行
      const promises = Array.from({ length: 100 }, () => {
        const request = new NextRequest('http://localhost:3000/dashboard');
        return middleware(request);
      });

      await Promise.all(promises);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 100回の実行が1秒以内に完了することを確認
      expect(duration).toBeLessThan(1000);
    });

    test('Supabaseクライアント作成が毎回実行される', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const request1 = new NextRequest('http://localhost:3000/dashboard');
      await middleware(request1);

      const request2 = new NextRequest('http://localhost:3000/events');
      await middleware(request2);

      expect(mockCreateClient).toHaveBeenCalledTimes(2);
    });
  });
});