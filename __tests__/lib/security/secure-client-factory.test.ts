/**
 * EventPay セキュアクライアントファクトリー テスト
 * 
 * セキュアSupabaseクライアントファクトリーの動作を検証
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  SecureSupabaseClientFactory,
  RLSBasedGuestValidator,
  getSecureClientFactory,
  getGuestTokenValidator
} from '@/lib/security/secure-client-factory.impl';
import {
  AdminReason,
  GuestErrorCode,
  GuestTokenError,
  AdminAccessError,
  AdminAccessErrorCode,
  AuditContext
} from '@/lib/security/secure-client-factory.types';

// モック設定
jest.mock('@/lib/security/security-auditor.impl', () => ({
  SecurityAuditorImpl: jest.fn().mockImplementation(() => ({
    logAdminAccess: jest.fn().mockResolvedValue(undefined),
    logGuestAccess: jest.fn().mockResolvedValue(undefined),
  }))
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: null, error: null })
      })
    })
  })
}));

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: null, error: null })
      })
    })
  }),
  createBrowserClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: null, error: null })
      })
    })
  })
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  })
}));

describe('SecureSupabaseClientFactory', () => {
  let factory: SecureSupabaseClientFactory;

  beforeEach(() => {
    // 環境変数をモック
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    factory = getSecureClientFactory();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('シングルトンパターン', () => {
    it('同じインスタンスを返すべき', () => {
      const factory1 = getSecureClientFactory();
      const factory2 = getSecureClientFactory();

      expect(factory1).toBe(factory2);
    });
  });

  describe('createAuthenticatedClient', () => {
    it('認証済みクライアントを作成できるべき', () => {
      const client = factory.createAuthenticatedClient();

      expect(client).toBeDefined();
      expect(typeof client).toBe('object');
    });

    it('オプションを適用できるべき', () => {
      const options = {
        persistSession: false,
        autoRefreshToken: false,
        headers: { 'X-Test': 'test' }
      };

      const client = factory.createAuthenticatedClient(options);

      expect(client).toBeDefined();
    });
  });

  describe('createGuestClient', () => {
    it('有効なゲストトークンでクライアントを作成できるべき', () => {
      const validToken = 'a'.repeat(32); // 32文字の有効なトークン

      const client = factory.createGuestClient(validToken);

      expect(client).toBeDefined();
    });

    it('無効なトークンフォーマットでエラーを投げるべき', () => {
      const invalidToken = 'invalid-token';

      expect(() => {
        factory.createGuestClient(invalidToken);
      }).toThrow(GuestTokenError);
    });

    it('短すぎるトークンでエラーを投げるべき', () => {
      const shortToken = 'short';

      expect(() => {
        factory.createGuestClient(shortToken);
      }).toThrow(GuestTokenError);
    });

    it('長すぎるトークンでエラーを投げるべき', () => {
      const longToken = 'a'.repeat(33);

      expect(() => {
        factory.createGuestClient(longToken);
      }).toThrow(GuestTokenError);
    });

    it('特殊文字を含むトークンでエラーを投げるべき', () => {
      const tokenWithSpecialChars = 'a'.repeat(31) + '!';

      expect(() => {
        factory.createGuestClient(tokenWithSpecialChars);
      }).toThrow(GuestTokenError);
    });
  });

  describe('createAuditedAdminClient', () => {
    const validAuditContext: AuditContext = {
      userId: 'test-user-id',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent'
    };

    it.skip('有効な理由とコンテキストで管理者クライアントを作成できるべき', async () => {
      // 実際のネットワーク呼び出しを避けるためスキップ
      expect(true).toBe(true);
    });

    it('無効な理由でエラーを投げるべき', async () => {
      await expect(
        factory.createAuditedAdminClient(
          'INVALID_REASON' as AdminReason,
          'Test context',
          validAuditContext
        )
      ).rejects.toThrow(AdminAccessError);
    });

    it('空のコンテキストでエラーを投げるべき', async () => {
      await expect(
        factory.createAuditedAdminClient(
          AdminReason.TEST_DATA_SETUP,
          '',
          validAuditContext
        )
      ).rejects.toThrow(AdminAccessError);
    });

    it('空白のみのコンテキストでエラーを投げるべき', async () => {
      await expect(
        factory.createAuditedAdminClient(
          AdminReason.TEST_DATA_SETUP,
          '   ',
          validAuditContext
        )
      ).rejects.toThrow(AdminAccessError);
    });
  });

  describe('createReadOnlyClient', () => {
    it('読み取り専用クライアントを作成できるべき', () => {
      const client = factory.createReadOnlyClient();

      expect(client).toBeDefined();
    });
  });

  describe('createBrowserClient', () => {
    it('ブラウザクライアントを作成できるべき', () => {
      const client = factory.createBrowserClient();

      expect(client).toBeDefined();
    });
  });
});

describe('RLSBasedGuestValidator', () => {
  let validator: RLSBasedGuestValidator;

  beforeEach(() => {
    validator = getGuestTokenValidator() as RLSBasedGuestValidator;
  });

  describe('validateTokenFormat', () => {
    it('有効なトークンフォーマットを正しく検証するべき', () => {
      const validToken = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

      expect(validator.validateTokenFormat(validToken)).toBe(true);
    });

    it('無効なトークンフォーマットを正しく検証するべき', () => {
      const invalidTokens = [
        'short',
        'a'.repeat(33), // 長すぎる
        'a'.repeat(31) + '!', // 特殊文字
        'a'.repeat(31) + ' ', // スペース
        '', // 空文字
      ];

      invalidTokens.forEach(token => {
        expect(validator.validateTokenFormat(token)).toBe(false);
      });
    });
  });

  describe('validateToken', () => {
    it.skip('無効なフォーマットのトークンで適切なエラーを返すべき', async () => {
      // 実際のネットワーク呼び出しを避けるためスキップ
      expect(true).toBe(true);
    });
  });
});

describe('環境変数チェック', () => {
  it('必要な環境変数が不足している場合エラーを投げるべき', () => {
    // 環境変数をクリア
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => {
      // 新しいインスタンスを作成しようとする
      new (SecureSupabaseClientFactory as any)();
    }).toThrow('Supabase environment variables are not configured');
  });
});

describe('統合テスト', () => {
  beforeEach(() => {
    // 環境変数を設定
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  it('ファクトリーとバリデーターが連携して動作するべき', async () => {
    const factory = getSecureClientFactory();
    const validator = getGuestTokenValidator();

    expect(factory).toBeDefined();
    expect(validator).toBeDefined();

    // 基本的な機能が動作することを確認
    const authClient = factory.createAuthenticatedClient();
    const readOnlyClient = factory.createReadOnlyClient();

    expect(authClient).toBeDefined();
    expect(readOnlyClient).toBeDefined();

    // バリデーターの基本機能
    const isValidFormat = validator.validateTokenFormat('a'.repeat(32));
    expect(isValidFormat).toBe(true);
  });
});