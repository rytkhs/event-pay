/**
 * @file 統一モックファクトリー
 * @description Jest profile分割の複雑化を解決するための統一モック管理
 * @author EventPay Team
 * @version 1.0.0
 * @since 2025-07-21
 *
 * TESTING_STRATEGY.md準拠の「外部依存のみモック」原則を実装
 * 単体・統合・E2Eテスト用のモック分離を提供
 */

import { jest } from "@jest/globals";
import { createClient } from "@supabase/supabase-js";

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
   * 統合テスト用モック（外部サービスのみモック、Supabaseは実環境）
   */
  static createIntegrationMocks() {
    const factory = UnifiedMockFactory.getInstance();

    return {
      // 外部サービスのみモック
      stripe: factory.createStripeMock(),
      resend: factory.createResendMock(),
      // Next.jsのモック（最小限）
      headers: factory.createHeadersMock(),
      cookies: factory.createCookiesMock(),
      nextRouter: factory.createNextRouterMock(),
      // Server Actionsのモック（最小限）
      serverActions: factory.createServerActionsMock(),
    };
  }

  /**
   * ローカルSupabaseクライアントを取得
   * 統合テスト用の実環境Supabaseクライアント
   */
  static getTestSupabaseClient() {
    return createClient(
      "http://127.0.0.1:54321",
      "SUPABASE_ANON_KEY_REDACTED",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            apikey:
              "SUPABASE_ANON_KEY_REDACTED",
            Authorization:
              "Bearer SUPABASE_ANON_KEY_REDACTED",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
        db: {
          schema: "public",
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      }
    );
  }

  /**
   * 認証済みテストユーザー用Supabaseクライアントを作成
   */
  static createClientWithAuth(user: { id: string; email: string }) {
    const client = UnifiedMockFactory.getTestSupabaseClient();
    // テスト用のセッションを設定
    const session = {
      access_token: "fake-access-token",
      refresh_token: "fake-refresh-token",
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: "bearer",
      user,
    };
    client.auth.setSession(session);
    return client;
  }

  /**
   * テスト用データセットアップヘルパー
   */
  static async setupTestData() {
    const client = UnifiedMockFactory.getTestSupabaseClient();

    // 既存のシードデータユーザーを使用
    const testUsers = [
      {
        id: "a0000000-0000-0000-0000-000000000001",
        email: "user1@test.com",
        name: "認証済み運営者",
      },
      {
        id: "a0000000-0000-0000-0000-000000000002",
        email: "user2@test.com",
        name: "未認証の運営者",
      },
    ];

    // 実際のテーブルスキーマに合わせたテストイベント作成（有効なUUID形式）
    const testEvents = [
      {
        id: "550e8400-e29b-41d4-a716-446655440010",
        title: "テストイベント1",
        created_by: "a0000000-0000-0000-0000-000000000001",
        invite_token: null, // 公開イベント
        date: "2025-01-30T10:00:00.000Z",
        fee: 1000,
        capacity: 10,
        payment_methods: ["stripe"],
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440011",
        title: "テストイベント2",
        created_by: "a0000000-0000-0000-0000-000000000002",
        invite_token: "private-token-123", // 非公開イベント
        date: "2025-02-01T14:00:00.000Z",
        fee: 2000,
        capacity: 5,
        payment_methods: ["stripe"],
      },
    ];

    return { testUsers, testEvents };
  }

  /**
   * テストデータクリーンアップ
   */
  static async cleanupTestData() {
    const client = UnifiedMockFactory.getTestSupabaseClient();

    // テストデータを削除（CASCADE設定によりリレーションも削除）
    try {
      // UUID形式のテストデータを削除
      await client
        .from("attendances")
        .delete()
        .like("event_id", "550e8400-e29b-41d4-a716-44665544%");
      await client.from("payments").delete().like("event_id", "550e8400-e29b-41d4-a716-44665544%");
      await client.from("events").delete().like("id", "550e8400-e29b-41d4-a716-44665544%");
      // usersテーブルはauthスキーマで管理されるため直接削除不可
    } catch (error) {
      console.warn("テストデータクリーンアップ中にエラー:", error);
    }
  }

  /**
   * 統合テスト用の統一セットアップ
   * 外部サービスのみモック、Supabaseは実環境使用
   */
  static setupIntegrationMocks() {
    // 実際に存在するファイルのみモック

    // Stripeクライアントのモック（実際のファイルパス）
    jest.mock("@/lib/stripe/client", () => ({
      stripe: {
        paymentIntents: {
          create: jest.fn(() => Promise.resolve({ id: "pi_test" })),
          retrieve: jest.fn(() => Promise.resolve({ id: "pi_test", status: "succeeded" })),
        },
        accounts: {
          create: jest.fn(() => Promise.resolve({ id: "acct_test" })),
          retrieve: jest.fn(() => Promise.resolve({ id: "acct_test" })),
        },
      },
    }));

    // Next.js最小限のモック（Server Actions動作に必要）
    jest.mock("next/cache", () => ({
      revalidatePath: jest.fn(),
      revalidateTag: jest.fn(),
    }));

    // レート制限は統合テストでは無効化
    jest.mock("@/lib/rate-limit/index", () => ({
      rateLimit: jest.fn(() => Promise.resolve({ success: true })),
      limit: jest.fn(() => Promise.resolve({ success: true })),
    }));

    return UnifiedMockFactory.createIntegrationMocks();
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
        // 基本認証メソッド
        getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        signInWithPassword: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        signUp: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        signOut: jest.fn(() => Promise.resolve({ error: null })),

        // パスワードリセット系
        resetPasswordForEmail: jest.fn(() => Promise.resolve({ data: {}, error: null })),
        updateUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),

        // セッション管理
        getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        refreshSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        setSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),

        // OTP認証
        verifyOtp: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        resend: jest.fn(() => Promise.resolve({ data: {}, error: null })),

        // イベントリスナー
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        like: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        single: jest.fn(() =>
          Promise.resolve({
            data: null,
            error: { message: "Test environment - using fallback mock" },
          })
        ),
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn(() => Promise.resolve({ data: null, error: null })),
          download: jest.fn(() => Promise.resolve({ data: null, error: null })),
          remove: jest.fn(() => Promise.resolve({ data: null, error: null })),
          list: jest.fn(() => Promise.resolve({ data: [], error: null })),
          getPublicUrl: jest.fn(() => ({ data: { publicUrl: "test-url" } })),
        })),
      },
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
      // 最小限のフック実装（外部依存のみモック）
      useEventEditForm: jest.fn(),
      useEventForm: jest.fn(),
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
      // Server Actions外部依存のみモック
      // 実際のServer Action実行は統合テストで実行
    };
  }

  private createNextNavigationMock() {
    return {
      redirect: jest.fn(),
      notFound: jest.fn(),
      permanentRedirect: jest.fn(),
    };
  }

  /**
   * 共通モック設定の自動適用
   */
  static setupCommonMocks() {
    // Next.js Navigation Mock
    jest.mock("next/navigation", () => ({
      useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
        refresh: jest.fn(),
      }),
      useSearchParams: () => ({
        get: jest.fn(),
        has: jest.fn(),
      }),
      usePathname: () => "/test-path",
      redirect: jest.fn(),
    }));

    // Next.js Headers Mock
    jest.mock("next/headers", () => ({
      headers: () => ({
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        has: jest.fn(),
      }),
      cookies: () => ({
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        has: jest.fn(),
      }),
    }));

    // Next.js Cache Mock
    jest.mock("next/cache", () => ({
      revalidatePath: jest.fn(),
      revalidateTag: jest.fn(),
      unstable_cache: jest.fn(),
    }));

    // Auth Security Mock
    jest.mock("@/lib/auth-security", () => ({
      validateAuthRequest: jest.fn(() => Promise.resolve(true)),
      checkRateLimit: jest.fn(() => Promise.resolve(false)),
      logSecurityEvent: jest.fn(),
    }));

    // Rate Limit Mock
    jest.mock("@/lib/rate-limit/index", () => ({
      rateLimit: jest.fn(() => Promise.resolve({ success: true })),
      limit: jest.fn(() => Promise.resolve({ success: true })),
    }));

    // Supabase Server Mock（統合テスト用）
    jest.mock("@/lib/supabase/server", () => ({
      createClient: jest.fn(() => ({
        auth: {
          // 基本認証メソッド
          getUser: jest.fn(() =>
            Promise.resolve({
              data: { user: { id: "test-user", email: "test@example.com" } },
              error: null,
            })
          ),
          signInWithPassword: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
          signUp: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
          signOut: jest.fn(() => Promise.resolve({ error: null })),

          // パスワードリセット系
          resetPasswordForEmail: jest.fn(() => Promise.resolve({ data: {}, error: null })),
          updateUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),

          // セッション管理
          getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
          refreshSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
          setSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),

          // OTP認証
          verifyOtp: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
          resend: jest.fn(() => Promise.resolve({ data: {}, error: null })),

          // イベントリスナー
          onAuthStateChange: jest.fn(() => ({
            data: { subscription: { unsubscribe: jest.fn() } },
          })),
        },
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          gt: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          like: jest.fn().mockReturnThis(),
          ilike: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          range: jest.fn().mockReturnThis(),
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
          maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
        storage: {
          from: jest.fn(() => ({
            upload: jest.fn(() => Promise.resolve({ data: null, error: null })),
            download: jest.fn(() => Promise.resolve({ data: null, error: null })),
            remove: jest.fn(() => Promise.resolve({ data: null, error: null })),
            list: jest.fn(() => Promise.resolve({ data: [], error: null })),
            getPublicUrl: jest.fn(() => ({ data: { publicUrl: "test-url" } })),
          })),
        },
      })),
    }));

    // Actions Mock
    jest.mock("@/app/events/actions/update-event", () => ({
      updateEventAction: jest.fn(() => Promise.resolve({ success: true })),
    }));

    jest.mock("@/app/events/actions", () => ({
      createEventAction: jest.fn(() => Promise.resolve({ success: true })),
      getEventsAction: jest.fn(() => Promise.resolve({ success: true, data: [] })),
    }));

    jest.mock("@/app/events/actions/get-events", () => ({
      getEventsAction: jest.fn(() => Promise.resolve({ success: true, data: [] })),
    }));

    jest.mock("@/app/events/actions/get-event-detail", () => ({
      getEventDetailAction: jest.fn(() => Promise.resolve({ success: true })),
    }));

    // Timezone Utils Mock
    jest.mock("@/lib/utils/timezone", () => ({
      formatUtcToJst: jest.fn((date) => date.toISOString().slice(0, 16)),
      formatUtcToDatetimeLocal: jest.fn((dateString) => {
        if (!dateString) return "";
        try {
          const date = new Date(dateString);
          return date.toISOString().slice(0, 16);
        } catch {
          return "";
        }
      }),
      formatUtcToJapaneseDisplay: jest.fn((dateString) => {
        if (!dateString) return "";
        try {
          const date = new Date(dateString);
          return date.toLocaleString("ja-JP");
        } catch {
          return "";
        }
      }),
    }));

    // Hooks Mock
    jest.mock("@/hooks/restrictions/use-event-restrictions", () => ({
      useEventRestrictions: jest.fn(() => ({
        isFieldRestricted: jest.fn(() => false),
        isFieldEditable: jest.fn(() => true),
        getFieldDisplayName: jest.fn((field) => field),
        getRestrictionReason: jest.fn(() => ""),
        getRestrictedFields: jest.fn(() => []),
        getRestrictedFieldNames: jest.fn(() => []),
      })),
    }));

    jest.mock("@/hooks/changes/use-event-changes", () => ({
      useEventChanges: jest.fn(() => ({
        hasChanges: false,
        detectChanges: jest.fn(() => []),
        hasFieldChanged: jest.fn(() => false),
        getChangedFieldNames: jest.fn(() => []),
        getChangeCount: jest.fn(() => 0),
        getChangeSummary: jest.fn(() => ""),
        getChangesByType: jest.fn(() => ({ basic: [], pricing: [], deadlines: [] })),
        hasCriticalChanges: jest.fn(() => false),
        getRevertData: jest.fn(() => ({})),
      })),
    }));

    jest.mock("@/hooks/submission/use-event-submission", () => ({
      useEventSubmission: jest.fn(() => ({
        submitForm: jest.fn(() => Promise.resolve({ success: true })),
      })),
    }));

    // React Hook Form Mock
    jest.mock("react-hook-form", () => ({
      useForm: jest.fn(() => ({
        register: jest.fn((name) => ({ name })),
        handleSubmit: jest.fn((onSubmit) => (event) => {
          event.preventDefault();
          onSubmit({});
        }),
        formState: { errors: {}, isSubmitting: false, isValid: true },
        watch: jest.fn(),
        setValue: jest.fn(),
        getValues: jest.fn(() => ({})),
        reset: jest.fn(),
        setError: jest.fn(),
        clearErrors: jest.fn(),
      })),
    }));

    // React Mock - 拡張版
    jest.mock("react", () => {
      const actual = jest.requireActual("react") as any;
      return {
        ...actual,
        useTransition: jest.fn(() => [false, jest.fn()]),
        startTransition: jest.fn((callback) => callback()),
        use: jest.fn(),
        cache: jest.fn((fn) => fn),
        memo: jest.fn((component) => component),
        forwardRef: jest.fn((component) => component),
        createContext: jest.fn(() => ({
          Provider: ({ children }: any) => children,
          Consumer: ({ children }: any) => children,
        })),
      };
    });
  }

  /**
   * 全モックをリセット
   */
  static resetAllMocks() {
    jest.resetAllMocks();
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
