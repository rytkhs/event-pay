/**
 * 統合された単体テスト用setup
 * 複雑なJest profile分割を解決するための簡素化版
 */

import {
  setupTestEnvironment,
  cleanupTestEnvironment,
} from "../../helpers/unified-mock-factory.ts";
import "@testing-library/jest-dom";

// フックの自動モック設定
jest.mock("@/hooks/use-event-edit-form", () => ({
  useEventEditForm: jest.fn(),
}));

jest.mock("@/hooks/use-event-form", () => ({
  useEventForm: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
  cookies: jest.fn(),
}));

// 単体テスト用の統一モック設定
beforeEach(() => {
  const mocks = setupTestEnvironment({
    level: "unit",
    features: {
      auth: true,
      database: false, // 単体テストではDB接続不要
      stripe: false, // 必要に応じて個別テストで有効化
      email: false, // 必要に応じて個別テストで有効化
    },
  });

  // グローバルモックの設定
  global.mockSupabase = mocks.supabase;
  global.mockHooks = mocks.hooks;
  global.mockNextRouter = mocks.nextRouter;
  global.mockHeaders = mocks.headers;
  global.mockCookies = mocks.cookies;

  // フックの実装を設定（グローバルモック経由）
  if (global.mockHooks) {
    global.mockHooks.useEventEditForm = mocks.hooks.useEventEditForm;
    global.mockHooks.useEventForm = mocks.hooks.useEventForm;
  }

  // 必要に応じて追加のモック設定
  if (mocks.stripe) {
    global.mockStripe = mocks.stripe;
  }
  if (mocks.resend) {
    global.mockResend = mocks.resend;
  }
});

afterEach(() => {
  cleanupTestEnvironment();
});

// 単体テスト用の基本的なDOM polyfills
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
