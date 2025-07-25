/**
 * 統合されたE2Eテスト用setup
 * 複雑なJest profile分割を解決するための簡素化版
 */

import { setupTestEnvironment, cleanupTestEnvironment } from "../../helpers/unified-mock-factory.ts";
import "@testing-library/jest-dom";

// E2Eテスト用の統一モック設定
beforeEach(() => {
  const mocks = setupTestEnvironment({
    level: 'e2e',
    features: {
      auth: true,
      database: false,    // E2EテストではPlaywrightが実際のDBと通信
      storage: false,     // 実際のストレージを使用
      stripe: false,      // 実際のStripeテストモードを使用
      email: true,        // メール送信のみモック
      rateLimit: false,   // 実際のレート制限を使用
      serverActions: false, // 実際のServer Actionsを使用
    }
  });

  // 最小限のグローバルモックの設定
  global.mockResend = mocks.resend; // メール送信のみモック
  global.mockNextRouter = mocks.nextRouter; // テスト用ルーターモック
  global.mockHooks = mocks.hooks; // 基本的なReactフックモック
});

afterEach(() => {
  cleanupTestEnvironment();
});

// E2Eテスト用の基本的なDOM polyfills
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
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

// E2Eテストでは実際のSupabaseクライアントを使用するため、モックは最小限
// 必要に応じて個別テストで特定の機能のみモック
