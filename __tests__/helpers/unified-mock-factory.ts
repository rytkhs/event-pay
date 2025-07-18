/**
 * 統一モックファクトリー
 * Jest profile分割の複雑化を解決するための統一モック管理
 */

import { jest } from '@jest/globals';

export interface MockConfig {
  level: 'unit' | 'integration' | 'e2e';
  features?: {
    auth?: boolean;
    database?: boolean;
    stripe?: boolean;
    email?: boolean;
  };
}

export class UnifiedMockFactory {
  private static instance: UnifiedMockFactory;
  private mocks: Map<string, any> = new Map();

  static getInstance(): UnifiedMockFactory {
    if (!UnifiedMockFactory.instance) {
      UnifiedMockFactory.instance = new UnifiedMockFactory();
    }
    return UnifiedMockFactory.instance;
  }

  /**
   * 単体テスト用の最小限モック
   */
  static createUnitMocks(features: MockConfig['features'] = {}) {
    const factory = UnifiedMockFactory.getInstance();

    return {
      supabase: factory.createMinimalSupabaseMock(),
      hooks: factory.createHooksMock(),
      nextRouter: factory.createNextRouterMock(),
      ...(features.stripe && { stripe: factory.createStripeMock() }),
      ...(features.email && { resend: factory.createResendMock() }),
    };
  }

  /**
   * 統合テスト用モック（外部サービスのみモック）
   */
  static createIntegrationMocks(features: MockConfig['features'] = {}) {
    const factory = UnifiedMockFactory.getInstance();

    return {
      // Supabaseは実際のテスト環境を使用
      supabase: factory.createRealSupabaseMock(),
      // 外部サービスはモック
      stripe: factory.createStripeMock(),
      resend: factory.createResendMock(),
      // Server Actionsのモック
      serverActions: factory.createServerActionsMock(),
    };
  }

  /**
   * E2Eテスト用設定（モックなし）
   */
  static createE2EMocks() {
    return {
      // E2Eテストではモックを使用しない
      // 実際のアプリケーション環境を使用
    };
  }

  private createMinimalSupabaseMock() {
    return {
      auth: {
        getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    };
  }

  private createRealSupabaseMock() {
    // 統合テストでは実際のSupabaseクライアントを使用
    // ただし、認証状態は制御可能にする
    return {
      auth: {
        getUser: jest.fn(() => Promise.resolve({
          data: { user: { id: 'test-user', email: 'test@example.com' } },
          error: null
        })),
      },
      // 他のメソッドは実際のSupabaseクライアントを使用
    };
  }

  private createHooksMock() {
    return {
      useEventEditForm: jest.fn(() => ({
        formData: {},
        errors: {},
        handleInputChange: jest.fn(),
        submitForm: jest.fn(),
      })),
      useEventForm: jest.fn(() => ({
        formData: {},
        errors: {},
        handleInputChange: jest.fn(),
        submitForm: jest.fn(),
      })),
    };
  }

  private createNextRouterMock() {
    return {
      useRouter: jest.fn(() => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
        refresh: jest.fn(),
      })),
      useSearchParams: jest.fn(() => ({
        get: jest.fn(),
        has: jest.fn(),
      })),
    };
  }

  private createStripeMock() {
    return {
      paymentIntents: {
        create: jest.fn(() => Promise.resolve({ id: 'pi_test' })),
        retrieve: jest.fn(),
      },
      accounts: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    };
  }

  private createResendMock() {
    return {
      emails: {
        send: jest.fn(() => Promise.resolve({ id: 'email_test' })),
      },
    };
  }

  private createServerActionsMock() {
    return {
      loginAction: jest.fn(() => Promise.resolve({ success: true })),
      registerAction: jest.fn(() => Promise.resolve({ success: true })),
      updateEventAction: jest.fn(() => Promise.resolve({ success: true })),
      createEventAction: jest.fn(() => Promise.resolve({ success: true })),
    };
  }

  /**
   * モックをリセット
   */
  static resetAllMocks() {
    const factory = UnifiedMockFactory.getInstance();
    factory.mocks.clear();
    jest.clearAllMocks();
  }
}

/**
 * テスト用ヘルパー関数
 */
export function setupTestEnvironment(config: MockConfig) {
  const { level, features } = config;

  switch (level) {
    case 'unit':
      return UnifiedMockFactory.createUnitMocks(features);
    case 'integration':
      return UnifiedMockFactory.createIntegrationMocks(features);
    case 'e2e':
      return UnifiedMockFactory.createE2EMocks();
    default:
      throw new Error(`Unknown test level: ${level}`);
  }
}

/**
 * テスト後のクリーンアップ
 */
export function cleanupTestEnvironment() {
  UnifiedMockFactory.resetAllMocks();
}
