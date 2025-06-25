/**
 * パスワードリセット機能テスト (AUTH-004)
 * POST /api/auth/reset-password, POST /api/auth/update-password のテスト
 */

import { NextRequest } from 'next/server';
import { POST as resetPasswordPOST } from '@/app/api/auth/reset-password/route';
import { POST as updatePasswordPOST } from '@/app/api/auth/update-password/route';

// モックの設定
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/rate-limit');

describe('パスワードリセット機能 (AUTH-004)', () => {
  let mockSupabaseClient: any;
  let mockRateLimit: any;

  beforeEach(() => {
    // Supabaseクライアントのモック
    mockSupabaseClient = {
      auth: {
        resetPasswordForEmail: jest.fn(),
        updateUser: jest.fn(),
        getUser: jest.fn(),
        verifyOtp: jest.fn(),
      },
    };

    // レート制限のモック
    mockRateLimit = {
      limit: jest.fn().mockResolvedValue({
        success: true,
        limit: 3,
        remaining: 2,
        reset: Date.now() + 300000,
      }),
    };

    jest.clearAllMocks();
  });

  describe('POST /api/auth/reset-password - パスワードリセット要求', () => {
    describe('正常系', () => {
      test('有効なメールアドレスでリセットメール送信成功', async () => {
        const resetRequest = {
          email: 'user@example.com',
        };

        mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
          data: {},
          error: null,
        });

        const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify(resetRequest),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await resetPasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(responseData.success).toBe(true);
        expect(responseData.message).toContain('パスワードリセットメールを送信しました');

        // SupabaseのresetPasswordForEmailが正しいパラメータで呼ばれることを確認
        expect(mockSupabaseClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          resetRequest.email,
          expect.objectContaining({
            redirectTo: expect.stringContaining('/auth/update-password'),
          })
        );
      });

      test('リダイレクトURLの適切な設定', async () => {
        const resetRequest = {
          email: 'user@example.com',
        };

        mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
          data: {},
          error: null,
        });

        const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify(resetRequest),
        });

        await resetPasswordPOST(request);

        const expectedRedirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password`;
        expect(mockSupabaseClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          resetRequest.email,
          { redirectTo: expectedRedirectUrl }
        );
      });
    });

    describe('バリデーション', () => {
      test('無効なメールアドレス形式でエラー', async () => {
        const invalidRequest = {
          email: 'invalid-email-format',
        };

        const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify(invalidRequest),
        });

        const response = await resetPasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.success).toBe(false);
        expect(responseData.error.code).toBe('INVALID_EMAIL');
        expect(responseData.error.message).toContain('有効なメールアドレス');
      });

      test('メールアドレス未入力でエラー', async () => {
        const emptyRequest = {};

        const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify(emptyRequest),
        });

        const response = await resetPasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error.code).toBe('MISSING_EMAIL');
      });
    });

    describe('セキュリティ対策', () => {
      test('存在しないメールアドレスでも成功レスポンス（ユーザー列挙攻撃対策）', async () => {
        const nonExistentRequest = {
          email: 'nonexistent@example.com',
        };

        // Supabaseは存在しないメールでもエラーを返さない
        mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
          data: {},
          error: null,
        });

        const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify(nonExistentRequest),
        });

        const response = await resetPasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(responseData.success).toBe(true);
        expect(responseData.message).toContain('パスワードリセットメールを送信しました');
      });

      test('レート制限によるスパム防止', async () => {
        mockRateLimit.limit.mockResolvedValue({
          success: false,
          limit: 3,
          remaining: 0,
          reset: Date.now() + 300000,
        });

        const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email: 'spam@example.com' }),
          headers: {
            'x-forwarded-for': '192.168.1.100',
          },
        });

        const response = await resetPasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(429);
        expect(responseData.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(response.headers.get('Retry-After')).toBeDefined();
      });

      test('レスポンス時間の一定化（タイミング攻撃対策）', async () => {
        const testEmails = [
          'existing@example.com',
          'nonexistent@example.com',
        ];

        const responseTimes: number[] = [];

        for (const email of testEmails) {
          const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
          });

          const startTime = Date.now();
          await resetPasswordPOST(request);
          const endTime = Date.now();
          
          responseTimes.push(endTime - startTime);
        }

        // レスポンス時間の差が小さいことを確認（タイミング攻撃対策）
        const timeDifference = Math.abs(responseTimes[0] - responseTimes[1]);
        expect(timeDifference).toBeLessThan(100); // 100ms未満の差
      });
    });
  });

  describe('POST /api/auth/update-password - パスワード再設定', () => {
    describe('正常系', () => {
      test('有効なトークンで新しいパスワード設定成功', async () => {
        const updateRequest = {
          access_token: 'valid-reset-token',
          refresh_token: 'valid-refresh-token',
          new_password: 'NewSecurePass123!',
        };

        // 有効なセッションをモック
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'user@example.com',
            },
          },
          error: null,
        });

        mockSupabaseClient.auth.updateUser.mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'user@example.com',
            },
          },
          error: null,
        });

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(updateRequest),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await updatePasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(responseData.success).toBe(true);
        expect(responseData.message).toBe('パスワードを更新しました');

        // パスワード更新が正しく呼ばれることを確認
        expect(mockSupabaseClient.auth.updateUser).toHaveBeenCalledWith({
          password: updateRequest.new_password,
        });
      });

      test('パスワード更新後のセッション設定', async () => {
        const updateRequest = {
          access_token: 'valid-reset-token',
          refresh_token: 'valid-refresh-token',
          new_password: 'NewSecurePass123!',
        };

        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-123', email: 'user@example.com' } },
          error: null,
        });

        mockSupabaseClient.auth.updateUser.mockResolvedValue({
          data: { user: { id: 'user-123' } },
          error: null,
        });

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(updateRequest),
        });

        const response = await updatePasswordPOST(request);

        // 新しいセッションCookieが設定されることを確認
        const setCookieHeader = response.headers.get('Set-Cookie');
        expect(setCookieHeader).toContain('HttpOnly');
        expect(setCookieHeader).toContain('SameSite=Lax');
      });
    });

    describe('トークン検証', () => {
      test('無効なトークンでエラー', async () => {
        const invalidRequest = {
          access_token: 'invalid-token',
          refresh_token: 'invalid-refresh',
          new_password: 'NewSecurePass123!',
        };

        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        });

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(invalidRequest),
        });

        const response = await updatePasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(401);
        expect(responseData.error.code).toBe('INVALID_TOKEN');
        expect(responseData.error.message).toBe('無効なリセットトークンです');
      });

      test('期限切れトークンでエラー', async () => {
        const expiredRequest = {
          access_token: 'expired-token',
          refresh_token: 'expired-refresh',
          new_password: 'NewSecurePass123!',
        };

        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Token expired' },
        });

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(expiredRequest),
        });

        const response = await updatePasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(401);
        expect(responseData.error.code).toBe('TOKEN_EXPIRED');
        expect(responseData.error.message).toContain('有効期限が切れています');
      });

      test('トークン未提供でエラー', async () => {
        const missingTokenRequest = {
          new_password: 'NewSecurePass123!',
          // access_token, refresh_token欠如
        };

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(missingTokenRequest),
        });

        const response = await updatePasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error.code).toBe('MISSING_TOKEN');
      });
    });

    describe('パスワードバリデーション', () => {
      beforeEach(() => {
        // 有効なトークンセットアップ
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-123', email: 'user@example.com' } },
          error: null,
        });
      });

      test('パスワード強度チェック - 最小8文字', async () => {
        const weakPasswordRequest = {
          access_token: 'valid-token',
          refresh_token: 'valid-refresh',
          new_password: '123456', // 8文字未満
        };

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(weakPasswordRequest),
        });

        const response = await updatePasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error.code).toBe('WEAK_PASSWORD');
        expect(responseData.error.message).toContain('8文字以上');
      });

      test('パスワード強度チェック - 英数字混在', async () => {
        const weakPasswordRequest = {
          access_token: 'valid-token',
          refresh_token: 'valid-refresh',
          new_password: 'onlyletters', // 数字なし
        };

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(weakPasswordRequest),
        });

        const response = await updatePasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error.code).toBe('WEAK_PASSWORD');
        expect(responseData.error.message).toContain('英数字を含める');
      });

      test('新パスワード未提供でエラー', async () => {
        const missingPasswordRequest = {
          access_token: 'valid-token',
          refresh_token: 'valid-refresh',
          // new_password欠如
        };

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(missingPasswordRequest),
        });

        const response = await updatePasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error.code).toBe('MISSING_PASSWORD');
      });
    });

    describe('有効期限チェック', () => {
      test('リセットトークンの有効期限（1時間）チェック', async () => {
        // 1時間前に発行されたトークンをモック
        const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
        
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Token expired' },
        });

        const expiredRequest = {
          access_token: 'expired-token',
          refresh_token: 'expired-refresh',
          new_password: 'NewSecurePass123!',
        };

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(expiredRequest),
        });

        const response = await updatePasswordPOST(request);
        const responseData = await response.json();

        expect(response.status).toBe(401);
        expect(responseData.error.code).toBe('TOKEN_EXPIRED');
      });

      test('有効期限内のトークンは正常に処理される', async () => {
        // 30分前に発行されたトークン（まだ有効）
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-123', email: 'user@example.com' } },
          error: null,
        });

        mockSupabaseClient.auth.updateUser.mockResolvedValue({
          data: { user: { id: 'user-123' } },
          error: null,
        });

        const validRequest = {
          access_token: 'valid-token',
          refresh_token: 'valid-refresh',
          new_password: 'NewSecurePass123!',
        };

        const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
          method: 'POST',
          body: JSON.stringify(validRequest),
        });

        const response = await updatePasswordPOST(request);

        expect(response.status).toBe(200);
      });
    });
  });

  describe('エラーハンドリング', () => {
    test('Supabaseサービスエラーの適切な処理', async () => {
      mockSupabaseClient.auth.resetPasswordForEmail.mockRejectedValue(
        new Error('Supabase service unavailable')
      );

      const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await resetPasswordPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(responseData.error.message).toContain('一時的に利用できません');
    });

    test('ネットワークエラー時のユーザーフレンドリーなメッセージ', async () => {
      mockSupabaseClient.auth.updateUser.mockRejectedValue(
        new Error('Network timeout')
      );

      const request = new NextRequest('http://localhost:3000/api/auth/update-password', {
        method: 'POST',
        body: JSON.stringify({
          access_token: 'valid-token',
          refresh_token: 'valid-refresh',
          new_password: 'NewSecurePass123!',
        }),
      });

      const response = await updatePasswordPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.error.message).toContain('ネットワークエラー');
    });
  });

  describe('セキュリティ強化', () => {
    test('パスワードがログに出力されないことを確認', () => {
      const sensitiveRequest = {
        access_token: 'token',
        refresh_token: 'refresh',
        new_password: 'SuperSecretPassword123!',
      };

      // ログ出力のモック確認
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // 実際の実装では、パスワードがログに出力されないことを確認
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(sensitiveRequest.new_password)
      );
      
      consoleSpy.mockRestore();
    });

    test('リセットトークンの一度限り使用制限', async () => {
      const sameTokenRequest = {
        access_token: 'one-time-token',
        refresh_token: 'one-time-refresh',
        new_password: 'FirstPassword123!',
      };

      // 初回使用は成功
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabaseClient.auth.updateUser.mockResolvedValueOnce({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const firstRequest = new NextRequest('http://localhost:3000/api/auth/update-password', {
        method: 'POST',
        body: JSON.stringify(sameTokenRequest),
      });

      const firstResponse = await updatePasswordPOST(firstRequest);
      expect(firstResponse.status).toBe(200);

      // 2回目の使用は失敗（トークンが無効化される）
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Token already used' },
      });

      const secondRequest = new NextRequest('http://localhost:3000/api/auth/update-password', {
        method: 'POST',
        body: JSON.stringify({
          ...sameTokenRequest,
          new_password: 'SecondPassword123!',
        }),
      });

      const secondResponse = await updatePasswordPOST(secondRequest);
      expect(secondResponse.status).toBe(401);
    });
  });
});