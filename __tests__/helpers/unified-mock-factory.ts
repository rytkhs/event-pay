/**
 * 統一モックファクトリー
 * Jest profile分割の複雑化を解決するための統一モック管理
 */

import { jest } from "@jest/globals";

export interface MockConfig {
  level: "unit" | "integration" | "e2e";
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
  static createUnitMocks(features: MockConfig["features"] = {}) {
    const factory = UnifiedMockFactory.getInstance();

    return {
      supabase: factory.createMinimalSupabaseMock(),
      hooks: factory.createHooksMock(),
      nextRouter: factory.createNextRouterMock(),
      headers: factory.createHeadersMock(),
      cookies: factory.createCookiesMock(),
      ...(features.stripe && { stripe: factory.createStripeMock() }),
      ...(features.email && { resend: factory.createResendMock() }),
    };
  }

  /**
   * 統合テスト用モック（外部サービスのみモック）
   */
  static createIntegrationMocks() {
    const factory = UnifiedMockFactory.getInstance();

    return {
      // Supabaseは実際のテスト環境を使用
      supabase: factory.createRealSupabaseMock(),
      // 外部サービスはモック
      stripe: factory.createStripeMock(),
      resend: factory.createResendMock(),
      // Next.jsのモック
      headers: factory.createHeadersMock(),
      cookies: factory.createCookiesMock(),
      nextRouter: factory.createNextRouterMock(),
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
        getUser: jest.fn(() =>
          Promise.resolve({
            data: { user: { id: "test-user", email: "test@example.com" } },
            error: null,
          })
        ),
      },
      // 他のメソッドは実際のSupabaseクライアントを使用
    };
  }

  private createHooksMock() {
    return {
      useEventEditForm: jest.fn(() => ({
        // React Hook Form
        form: {
          formState: {
            errors: {},
            isSubmitting: false,
            isDirty: false,
            isValid: true,
          },
          getValues: jest.fn(() => ({
            title: "テストイベント",
            description: "テストイベントの説明",
            location: "東京都渋谷区",
            date: "2024-01-01T10:00",
            fee: "1000",
            capacity: "50",
            payment_methods: ["stripe"],
            registration_deadline: "2023-12-31T23:59",
            payment_deadline: "2023-12-31T23:59",
          })),
          setValue: jest.fn(),
          reset: jest.fn(),
          handleSubmit: jest.fn((fn) => fn),
          watch: jest.fn(() => ({})),
        },
        onSubmit: jest.fn(),
        isPending: false,

        // フォーム状態
        formData: {
          title: "テストイベント",
          description: "テストイベントの説明",
          location: "東京都渋谷区",
          date: "2024-01-01T10:00",
          fee: "1000",
          capacity: "50",
          payment_methods: ["stripe"],
          registration_deadline: "2023-12-31T23:59",
          payment_deadline: "2023-12-31T23:59",
        },
        hasAttendees: false,

        // バリデーション
        validation: {
          errors: {},
          hasErrors: false,
          isValid: true,
          isDirty: false,
        },

        // 編集制限
        restrictions: {
          isFieldRestricted: jest.fn(() => false),
          isFieldEditable: jest.fn(() => true),
          getFieldDisplayName: jest.fn((field: string) => field),
          getRestrictionReason: jest.fn(() => ""),
          getRestrictedFields: jest.fn(() => []),
          getRestrictedFieldNames: jest.fn(() => []),
        },

        // 変更検出
        changes: {
          hasChanges: false,
          detectChanges: jest.fn(() => []),
          hasFieldChanged: jest.fn(() => false),
          getChangedFieldNames: jest.fn(() => []),
          getChangeCount: jest.fn(() => 0),
          getChangeSummary: jest.fn(() => ""),
          getChangesByType: jest.fn(() => ({})),
          hasCriticalChanges: jest.fn(() => false),
          getRevertData: jest.fn(() => ({})),
        },

        // フォーム操作
        actions: {
          resetForm: jest.fn(),
          submitForm: jest.fn(() => Promise.resolve({ success: true })),
          submitFormWithChanges: jest.fn(() => Promise.resolve({ success: true })),
        },
      })),
      useEventForm: jest.fn(() => ({
        form: {
          formState: {
            errors: {},
            isSubmitting: false,
            isDirty: false,
            isValid: true,
          },
          getValues: jest.fn(() => ({})),
          setValue: jest.fn(),
          reset: jest.fn(),
          handleSubmit: jest.fn((fn) => fn),
          watch: jest.fn(() => ({})),
        },
        onSubmit: jest.fn(),
        isPending: false,
        hasErrors: false,
        validationRules: {},
        formData: {
          title: "",
          description: "",
          location: "",
          date: "",
          capacity: "",
          registrationDeadline: "",
          paymentDeadline: "",
          paymentMethods: "",
          fee: "",
        },
        errors: {},
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

  private createHeadersMock() {
    return {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      has: jest.fn(),
      entries: jest.fn(() => []),
      keys: jest.fn(() => []),
      values: jest.fn(() => []),
      forEach: jest.fn(),
      append: jest.fn(),
      getSetCookie: jest.fn(() => []),
    };
  }

  private createCookiesMock() {
    return {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      has: jest.fn(),
      clear: jest.fn(),
      getAll: jest.fn(() => []),
      toString: jest.fn(() => ""),
    };
  }

  private createStripeMock() {
    return {
      paymentIntents: {
        create: jest.fn(() => Promise.resolve({ id: "pi_test" })),
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
        send: jest.fn(() => Promise.resolve({ id: "email_test" })),
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
    case "unit":
      return UnifiedMockFactory.createUnitMocks(features);
    case "integration":
      return UnifiedMockFactory.createIntegrationMocks();
    case "e2e":
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
