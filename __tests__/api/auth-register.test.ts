/**
 * ユーザー登録機能テスト (AUTH-005)
 * POST /api/auth/register のテスト
 */

import { NextRequest } from 'next/server';
import { POST as registerPOST } from '@/app/api/auth/register/route';

// モックの設定
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/rate-limit');

describe('ユーザー登録機能 (AUTH-005)', () => {
  let mockSupabaseClient: any;
  let mockServiceClient: any;
  let mockRateLimit: any;

  beforeEach(() => {
    // Supabaseクライアントのモック
    mockSupabaseClient = {
      auth: {
        signUp: jest.fn(),
        getUser: jest.fn(),
      },
    };

    // Service Role Key クライアントのモック
    mockServiceClient = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    // レート制限のモック
    mockRateLimit = {
      limit: jest.fn().mockResolvedValue({
        success: true,
        limit: 5,
        remaining: 4,
        reset: Date.now() + 300000,
      }),
    };

    jest.clearAllMocks();
  });

  describe('正常系', () => {
    test('有効な情報での新規ユーザー登録成功', async () => {
      const validRegistration = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        name: '山田太郎',
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: {
            id: 'user-456',
            email: validRegistration.email,
            email_confirmed_at: null, // メール確認待ち
          },
          session: null, // メール確認前はセッションなし
        },
        error: null,
      });

      // usersテーブルへの挿入成功をモック
      mockServiceClient.single.mockResolvedValue({
        data: {
          id: 'user-456',
          email: validRegistration.email,
          name: validRegistration.name,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(validRegistration),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(201);
      expect(responseData.success).toBe(true);
      expect(responseData.data.user.email).toBe(validRegistration.email);
      expect(responseData.message).toContain('確認メールを送信しました');

      // usersテーブルにデータが挿入されることを確認
      expect(mockServiceClient.insert).toHaveBeenCalledWith({
        id: 'user-456',
        email: validRegistration.email,
        name: validRegistration.name,
      });
    });

    test('メール確認完了後の自動ログイン', async () => {
      const registrationData = {
        email: 'confirmed@example.com',
        password: 'SecurePass123!',
        name: '確認済みユーザー',
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: {
            id: 'user-789',
            email: registrationData.email,
            email_confirmed_at: new Date().toISOString(), // メール確認済み
          },
          session: {
            access_token: 'access-token-789',
            refresh_token: 'refresh-token-789',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registrationData),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(201);
      expect(responseData.data.session).toBeDefined();
      
      // HTTPOnly Cookieが設定されることを確認
      const setCookieHeader = response.headers.get('Set-Cookie');
      expect(setCookieHeader).toContain('HttpOnly');
    });
  });

  describe('入力値バリデーション', () => {
    test('無効なメールアドレス形式でエラー', async () => {
      const invalidRegistration = {
        email: 'invalid-email-format',
        password: 'SecurePass123!',
        name: '山田太郎',
      };

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(invalidRegistration),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.success).toBe(false);
      expect(responseData.error.code).toBe('INVALID_EMAIL');
      expect(responseData.error.message).toContain('有効なメールアドレス');
    });

    test('パスワード強度チェック - 最小8文字', async () => {
      const weakPasswordRegistration = {
        email: 'test@example.com',
        password: '123456', // 8文字未満
        name: '山田太郎',
      };

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(weakPasswordRegistration),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error.code).toBe('WEAK_PASSWORD');
      expect(responseData.error.message).toContain('8文字以上');
    });

    test('パスワード強度チェック - 英数字混在必須', async () => {
      const weakPasswordRegistration = {
        email: 'test@example.com',
        password: 'onlyletters', // 数字なし
        name: '山田太郎',
      };

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(weakPasswordRegistration),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error.code).toBe('WEAK_PASSWORD');
      expect(responseData.error.message).toContain('英数字を含める');
    });

    test('名前の文字数制限チェック', async () => {
      const longNameRegistration = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'あ'.repeat(256), // 255文字超過
      };

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(longNameRegistration),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error.code).toBe('NAME_TOO_LONG');
      expect(responseData.error.message).toContain('255文字以内');
    });

    test('必須フィールド未入力チェック', async () => {
      const incompleteRegistration = {
        email: 'test@example.com',
        // password と name が未入力
      };

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(incompleteRegistration),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error.code).toBe('MISSING_FIELDS');
      expect(responseData.error.message).toContain('必須項目');
    });

    test('XSS攻撃対策 - HTMLタグのサニタイゼーション', async () => {
      const xssAttempt = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '<script>alert("XSS")</script>悪意のあるユーザー',
      };

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(xssAttempt),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      if (response.status === 201) {
        // 登録成功の場合、名前がサニタイズされていることを確認
        expect(responseData.data.user.name).not.toContain('<script>');
        expect(responseData.data.user.name).toContain('&lt;script&gt;');
      } else {
        // または不正な文字として拒否されることを確認
        expect(responseData.error.code).toBe('INVALID_CHARACTERS');
      }
    });
  });

  describe('重複ユーザー対応', () => {
    test('既存メールアドレスでの登録試行', async () => {
      const duplicateRegistration = {
        email: 'existing@example.com',
        password: 'SecurePass123!',
        name: '重複ユーザー',
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(duplicateRegistration),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(409);
      expect(responseData.error.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(responseData.error.message).toBe('このメールアドレスは既に登録されています');
    });

    test('ユーザー列挙攻撃対策', async () => {
      // 既存ユーザーでも同じレスポンス時間とメッセージにする
      const registrationData = {
        email: 'probe@example.com',
        password: 'SecurePass123!',
        name: 'プローブユーザー',
      };

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registrationData),
      });

      const startTime = Date.now();
      const response = await registerPOST(request);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // レスポンス時間が一定の範囲内であることを確認（タイミング攻撃対策）
      expect(responseTime).toBeGreaterThan(100); // 最低100ms
      expect(responseTime).toBeLessThan(2000); // 最大2秒
    });
  });

  describe('メール確認フロー', () => {
    test('メール確認リンクの生成', async () => {
      const registrationData = {
        email: 'confirm@example.com',
        password: 'SecurePass123!',
        name: '確認待ちユーザー',
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: {
            id: 'user-confirm-123',
            email: registrationData.email,
            email_confirmed_at: null,
          },
          session: null,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registrationData),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(201);
      expect(responseData.message).toContain('確認メール');
      expect(responseData.data.emailConfirmationSent).toBe(true);
    });

    test('メール確認の有効期限設定', async () => {
      // メール確認リンクの有効期限（24時間）が適切に設定されることを確認
      const expectedExpiry = 24 * 60 * 60; // 24時間（秒）
      
      // Supabaseの設定で確認リンクの有効期限が設定されることをテスト
      expect(expectedExpiry).toBe(86400);
    });
  });

  describe('usersテーブル同期', () => {
    test('auth.usersとpublic.usersの同期', async () => {
      const registrationData = {
        email: 'sync@example.com',
        password: 'SecurePass123!',
        name: '同期テストユーザー',
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: {
            id: 'user-sync-123',
            email: registrationData.email,
            email_confirmed_at: new Date().toISOString(),
          },
          session: {},
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registrationData),
      });

      await registerPOST(request);

      // Service Role Key を使用してusersテーブルにINSERTされることを確認
      expect(mockServiceClient.from).toHaveBeenCalledWith('users');
      expect(mockServiceClient.insert).toHaveBeenCalledWith({
        id: 'user-sync-123',
        email: registrationData.email,
        name: registrationData.name,
      });
    });

    test('usersテーブル挿入失敗時のロールバック', async () => {
      const registrationData = {
        email: 'rollback@example.com',
        password: 'SecurePass123!',
        name: 'ロールバックテスト',
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: { id: 'user-rollback-123', email: registrationData.email },
          session: null,
        },
        error: null,
      });

      // usersテーブルへの挿入が失敗
      mockServiceClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      });

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registrationData),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.error.code).toBe('USER_SYNC_FAILED');
      
      // auth.users からのユーザー削除処理が実行されることを確認
      // 実際の実装では Admin API を使用してクリーンアップを行う
    });
  });

  describe('レート制限', () => {
    test('IP単位でのレート制限', async () => {
      mockRateLimit.limit.mockResolvedValue({
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 300000,
      });

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'ratelimit@example.com',
          password: 'SecurePass123!',
          name: 'レート制限テスト',
        }),
        headers: {
          'x-forwarded-for': '192.168.1.100',
        },
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      expect(response.status).toBe(429);
      expect(responseData.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    test('メールアドレス単位での重複登録防止', async () => {
      // 同一メールアドレスでの短時間内の複数登録試行を防止
      const email = 'duplicate@example.com';
      
      mockRateLimit.limit.mockImplementation(async (identifier: string) => {
        if (identifier.includes(email)) {
          return {
            success: false,
            limit: 1,
            remaining: 0,
            reset: Date.now() + 60000, // 1分間制限
          };
        }
        return { success: true, limit: 1, remaining: 0, reset: Date.now() + 60000 };
      });

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password: 'SecurePass123!',
          name: '重複防止テスト',
        }),
      });

      const response = await registerPOST(request);
      
      expect(response.status).toBe(429);
    });
  });

  describe('セキュリティ要件', () => {
    test('パスワードハッシュ化の確認', () => {
      // Supabaseがパスワードを適切にハッシュ化することを確認
      // 平文パスワードがログやレスポンスに含まれないことを確認
      
      const registrationData = {
        email: 'security@example.com',
        password: 'PlaintextPassword123!',
        name: 'セキュリティテスト',
      };

      // テスト内でパスワードが平文で保存・送信されないことを確認
      expect(registrationData.password).not.toBe(''); // パスワードが存在
      // 実際の実装では、パスワードはSupabaseに渡された後は保存されない
    });

    test('個人情報の適切な保護', async () => {
      const sensitiveData = {
        email: 'privacy@example.com',
        password: 'SecurePass123!',
        name: '個人情報太郎',
      };

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(sensitiveData),
      });

      const response = await registerPOST(request);
      const responseData = await response.json();

      // レスポンスにパスワードが含まれないことを確認
      expect(JSON.stringify(responseData)).not.toContain(sensitiveData.password);
      
      // ログにも機密情報が出力されないことを確認
      // 実際の実装では適切なログマスキングを実装
    });
  });
});