/**
 * 統合された統合テスト用setup
 * 複雑なJest profile分割を解決するための簡素化版
 */

import {
  setupTestEnvironment,
  cleanupTestEnvironment,
} from "../../helpers/unified-mock-factory.ts";
import "@testing-library/jest-dom";

// 統合テスト用の統一モック設定
beforeEach(() => {
  const mocks = setupTestEnvironment({
    level: "integration",
    features: {
      auth: true,
      database: true, // 統合テストではDB接続をモック
      storage: true, // ストレージ機能をモック
      stripe: true, // Stripe決済をモック
      email: true, // メール送信をモック
      rateLimit: true, // レート制限をモック
      serverActions: true, // Server Actionsをモック
    },
    data: {
      users: [
        { id: "user-1", email: "test@example.com", name: "Test User" },
        { id: "user-2", email: "test2@example.com", name: "Test User 2" },
      ],
      events: [{ id: "event-1", title: "Test Event", creator_id: "user-1" }],
      attendances: [
        { id: "attendance-1", event_id: "event-1", user_id: "user-1", status: "confirmed" },
      ],
    },
  });

  // グローバルモックの設定
  global.mockSupabase = mocks.supabase;
  global.mockStripe = mocks.stripe;
  global.mockResend = mocks.resend;
  global.mockRateLimit = mocks.rateLimit;
  global.mockRedis = mocks.redis;
  global.mockNextRouter = mocks.nextRouter;
  global.mockSearchParams = mocks.searchParams;
  global.mockHeaders = mocks.headers;
  global.mockCookies = mocks.cookies;
  global.mockHooks = mocks.hooks;
});

afterEach(() => {
  cleanupTestEnvironment();
});

// global.createSupabaseClient の実装
global.createSupabaseClient = () => {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
    process.env.SUPABASE_SERVICE_KEY || "test-service-key"
  );
};

// 統合テスト用の基本的なDOM polyfills
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

// Supabaseクライアントのモック（実際のSupabaseクライアントは使わない）
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: { id: "test-user-id", email: "test@example.com" },
          session: { access_token: "test-token" },
        },
        error: null,
      }),
      signUp: jest.fn().mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" }, session: null },
        error: null,
      }),
      signOut: jest.fn().mockResolvedValue({
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "test-token", user: { id: "test-user-id" } } },
        error: null,
      }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({
        data: {},
        error: null,
      }),
      refreshSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "new-test-token" } },
        error: null,
      }),
    },
    from: jest.fn(() => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      };
      return mockQueryBuilder;
    }),
  })),
}));

// Next.jsのcacheモック
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));
