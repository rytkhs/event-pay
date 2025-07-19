// EventPay 統合テスト用のシンプルなsetupファイル
import "@testing-library/jest-dom";

// 基本的なDOM polyfills
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// ResizeObserver polyfill
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
};

// IntersectionObserver polyfill
global.IntersectionObserver = class IntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
};

// Next.js関連のモック
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => "/test-path",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

// React関連のモック
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useTransition: () => [false, jest.fn()],
  startTransition: jest.fn((fn) => fn()),
}));

// Server Actionsのモック
jest.mock("@/app/auth/actions", () => {
  const mockActions = require("./mocks/server-actions.js");
  return mockActions;
});

// 環境変数の設定
process.env.NODE_ENV = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// グローバルレベルでSupabaseクライアント作成関数を定義
global.createSupabaseClient = () => {
  // テストパスの取得（getStateが使用できない場合は、ファイル名から判定）
  let testPath = "";
  try {
    testPath = expect.getState().testPath || "";
  } catch (error) {
    // expect.getStateが利用できない場合は、Error stackから推測
    const stack = new Error().stack;
    if (stack) {
      const match = stack.match(/\/([^\/]+\.test\.[jt]s)/);
      if (match) {
        testPath = match[1];
      }
    }
  }

  // 実際のSupabaseローカル環境を使用する統合テストかどうかを判定
  const useRealSupabase =
    (testPath.includes("integration") &&
      !testPath.includes("mock") &&
      process.env.NODE_ENV === "test") ||
    testPath.includes("real-supabase") ||
    testPath.includes("schema-validation");

  if (useRealSupabase) {
    // 実際のSupabaseクライアントを使用
    const { createClient } = require("@supabase/supabase-js");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // テスト用のサービスロールクライアントも作成（データクリーンアップ用）
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
    const serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // サービスロールクライアントをテスト用に追加
    supabase.serviceRole = serviceRoleClient;

    console.log("🔧 Using real Supabase client for test:", testPath);
    return supabase;
  } else {
    // モック版のSupabaseクライアント（既存のモック）
    console.log("🔧 Using mock Supabase client for test:", testPath);
    return {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "test-user-id" } },
          error: null,
        }),
        getSession: jest.fn().mockResolvedValue({
          data: { session: { access_token: "valid-token" } },
          error: null,
        }),
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: { id: "test-user-id" }, session: { access_token: "test-token" } },
          error: null,
        }),
        signOut: jest.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
        setSession: jest.fn().mockResolvedValue({
          data: { session: { access_token: "test-token" } },
          error: null,
        }),
      },
      from: jest.fn(() => {
        const createMockBuilder = () => {
          const mockBuilder = {
            select: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            eq: jest.fn(),
            neq: jest.fn(),
            limit: jest.fn(),
            single: jest.fn().mockResolvedValue({
              data: { id: "single-id" },
              error: null,
            }),
          };

          // 各メソッドがチェーンできるように設定
          Object.keys(mockBuilder).forEach((key) => {
            if (key !== "single") {
              mockBuilder[key].mockReturnValue(mockBuilder);
            }
          });

          return mockBuilder;
        };

        return createMockBuilder();
      }),
    };
  }
};

// テスト前の基本的なクリーンアップ
beforeEach(() => {
  jest.clearAllMocks();

  // グローバルモックの設定
  const mocks = global.createSimpleMock();
  global.mockSupabase = mocks.supabase;
  global.mockHeaders = mocks.headers;
  global.mockCookies = mocks.cookies;
});

// コンソールエラー/警告を抑制（テストで発生する予期されるエラーのみ）
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  // React Testing Library関連の警告を抑制
  if (
    args[0]?.includes?.("Warning: ReactDOM.render is no longer supported") ||
    args[0]?.includes?.("Warning: An invalid form control") ||
    args[0]?.includes?.('Warning: Each child in a list should have a unique "key" prop')
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  // 既知の警告を抑制
  if (
    args[0]?.includes?.("Warning: componentWillReceiveProps") ||
    args[0]?.includes?.("Warning: Legacy")
  ) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

// グローバルテストヘルパー
global.createMockFormData = (data) => {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
};

// 単純なモック用のファクトリー関数
global.createSimpleMock = (mockData = {}) => {
  return {
    // Supabase関連の基本的なモック
    supabase: {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "test-user-id", email: "test@example.com" } },
          error: null,
        }),
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: { id: "test-user-id" }, session: { access_token: "test-token" } },
          error: null,
        }),
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
      from: jest.fn(() => ({
        select: jest.fn().mockResolvedValue({
          data: [{ id: "user-1", email: "test@example.com", name: "Test User" }],
          error: null,
        }),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: [{ id: "user-1", email: "test@example.com", name: "Test User" }],
          error: null,
        }),
      })),
    },
    // Stripe関連のモック
    stripe: {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({
          id: "pi_test_123",
          amount: 1000,
          currency: "jpy",
          status: "requires_payment_method",
        }),
      },
    },
    // Resend関連のモック
    resend: {
      emails: {
        send: jest.fn().mockResolvedValue({
          id: "email_test_123",
          to: ["test@example.com"],
          from: "noreply@eventpay.com",
          subject: "Test Email",
        }),
      },
    },
    // Headers/Cookiesのモック
    headers: {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      entries: jest.fn(() => []),
      forEach: jest.fn(),
      keys: jest.fn(() => []),
      values: jest.fn(() => []),
    },
    cookies: {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      getAll: jest.fn(() => []),
      toString: jest.fn(() => ""),
    },
    // Server Actions関連のモック
    serverActions: {
      createEvent: jest.fn().mockResolvedValue({ success: true, data: { id: "test-event-id" } }),
      updateEvent: jest.fn().mockResolvedValue({ success: true }),
      deleteEvent: jest.fn().mockResolvedValue({ success: true }),
      loginAction: jest.fn().mockImplementation((formData) => {
        const email = formData.get("email");
        if (email === "invalid@example.com") {
          return Promise.resolve({
            success: false,
            error: "メールアドレスまたはパスワードが正しくありません",
          });
        }
        return Promise.resolve({ success: true });
      }),
    },
    // フック関連のモック
    hooks: {
      useEventForm: jest.fn(() => ({
        form: {
          control: {},
          handleSubmit: jest.fn(),
          formState: { errors: {} },
          watch: jest.fn(),
          setValue: jest.fn(),
          getValues: jest.fn(),
          reset: jest.fn(),
          setError: jest.fn(),
          clearErrors: jest.fn(),
        },
        onSubmit: jest.fn(),
        isPending: false,
        hasErrors: false,
        validationRules: {
          title: {
            required: "タイトルは必須です",
            maxLength: {
              value: 100,
              message: "タイトルは100文字以内で入力してください",
            },
          },
          date: {
            required: "開催日時は必須です",
          },
          fee: {
            required: "参加費は必須です",
            min: {
              value: 0,
              message: "参加費は0以上である必要があります",
            },
          },
        },
      })),
    },
  };
};

// 統合テスト用のユーティリティ関数
global.waitForLoadingToFinish = async () => {
  const { waitForElementToBeRemoved } = require("@testing-library/react");
  try {
    await waitForElementToBeRemoved(() => document.querySelector('[data-testid="loading"]'), {
      timeout: 3000,
    });
  } catch (error) {
    // ローディング要素が見つからない場合は何もしない
  }
};

// テストの実行環境を標準出力に表示
console.log("🧪 EventPay Integration Test Environment Initialized");
console.log("📍 Test Environment:", process.env.NODE_ENV);
console.log("🔧 Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
