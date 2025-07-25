/**
 * @file 統合テスト用セットアップファイル
 * @description ローカルSupabase統合テスト環境の初期化
 * @author EventPay Team
 * @version 1.0.0
 * @since 2025-01-22
 */

import "@testing-library/jest-dom";
import { config } from "dotenv";
import { UnifiedMockFactory } from "./helpers/unified-mock-factory";

// テスト用環境変数を読み込み
config({ path: ".env.test.local" });

// DOM環境のpolyfill
if (typeof global.window === "undefined") {
  Object.defineProperty(global, "window", {
    value: global,
    writable: true,
  });
}

// ResizeObserver polyfill（@radix-ui/react-use-size対応）
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

// cross-fetch polyfill for complete fetch API support in Jest
import "cross-fetch/polyfill";

// DOMPurifyが必要とするDOM APIのpolyfill（既に存在しない場合のみ）
if (typeof global.document === "undefined") {
  Object.defineProperty(global, "document", {
    value: {
      createElement: jest.fn(() => ({})),
      createDocumentFragment: jest.fn(() => ({})),
    },
    writable: true,
  });
}

// 統合テスト用のグローバル設定
global.console = {
  ...console,
  // テスト実行時の不要なログを抑制
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
};

// 統合テスト用のモック設定とローカルSupabase環境検証
beforeAll(async () => {
  console.log("🚀 統合テスト環境初期化開始...");

  // 外部依存のみモック（Supabaseは実環境使用）
  UnifiedMockFactory.setupIntegrationMocks();
  console.log("✅ 統合テスト用モック設定完了（外部依存のみ）");

  // ローカルSupabase接続確認（Phase C-1要件）
  try {
    const supabase = UnifiedMockFactory.getTestSupabaseClient();
    // 軽量な接続確認のみ（詳細テストは個別テストで実行）
    const { error } = await supabase.from("events").select("id").limit(1);
    if (error) {
      console.warn("⚠️ ローカルSupabase接続警告:", error.message);
      // 接続エラーでもテストは継続（個別テストで対応）
    } else {
      console.log("✅ ローカルSupabase接続確認済み");
    }
  } catch (error) {
    console.warn("⚠️ ローカルSupabase環境初期化警告:", error.message);
    // 接続確認失敗でもテストは継続
  }

  // テスト用データベースの初期化
  try {
    await UnifiedMockFactory.setupTestData();
    console.log("✅ テストデータ準備完了");
  } catch (error) {
    console.warn("⚠️ テストデータ準備警告:", error.message);
  }

  console.log("🎯 統合テスト環境初期化完了");
});

// 各テスト前の個別準備
beforeEach(async () => {
  // テスト固有のデータ準備（必要に応じて）
  try {
    // 軽量なテストデータリフレッシュ
    await UnifiedMockFactory.setupTestData();
  } catch (error) {
    console.warn("⚠️ テストデータ準備警告:", error.message);
  }
});

// 各テスト後のクリーンアップ
afterEach(async () => {
  // モックの状態をリセット（実際のDBデータは保持）
  jest.clearAllMocks();

  // テストデータの軽量クリーンアップ
  try {
    await UnifiedMockFactory.cleanupTestData();
  } catch (error) {
    console.warn("⚠️ テストデータクリーンアップ警告:", error.message);
  }
});

// 全テスト終了後のクリーンアップ
afterAll(async () => {
  console.log("🧹 統合テスト環境クリーンアップ開始...");

  try {
    // テストデータの完全クリーンアップ
    await UnifiedMockFactory.cleanupTestData();
    console.log("✅ テストデータクリーンアップ完了");
  } catch (error) {
    console.warn("⚠️ テストデータクリーンアップ警告:", error.message);
  }

  // モックのリセット
  UnifiedMockFactory.resetAllMocks();
  console.log("✅ モックリセット完了");

  console.log("🎉 統合テスト環境クリーンアップ完了");
});

// 統合テスト用のヘルパー関数をグローバルに追加
global.testHelpers = {
  // ローカルSupabaseクライアント取得
  getSupabaseClient: () => UnifiedMockFactory.getTestSupabaseClient(),

  // テストユーザー作成
  createTestUser: async (email = "test@example.com", password = "testpassword123") => {
    const supabase = UnifiedMockFactory.getTestSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  },

  // テストイベント作成
  createTestEvent: async (userId = "test-user-id") => {
    const supabase = UnifiedMockFactory.getTestSupabaseClient();
    const eventData = {
      title: "Test Event",
      description: "Test Description",
      event_date: new Date().toISOString(),
      location: "Test Location",
      max_participants: 10,
      price: 1000,
      is_public: true,
      user_id: userId,
    };

    const { data, error } = await supabase.from("events").insert(eventData).select().single();

    return { data, error };
  },

  // テストデータクリーンアップ
  cleanupTestData: async () => {
    const supabase = UnifiedMockFactory.getTestSupabaseClient();

    // テスト用のイベントを削除
    await supabase.from("events").delete().like("title", "Test%");

    // テスト用のユーザーは認証システムで管理されるため、
    // 必要に応じて個別に削除
  },
};

// 統合テスト用の環境変数検証
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error("Integration test environment variables are not properly configured");
}

// FormData polyfill（Node.js環境用）
if (typeof global.FormData === "undefined") {
  global.FormData = class MockFormData {
    constructor() {
      this.data = new Map();
    }
    append(key, value) {
      this.data.set(key, value);
    }
    get(key) {
      return this.data.get(key);
    }
    has(key) {
      return this.data.has(key);
    }
    entries() {
      return this.data.entries();
    }
  };
}

console.log("🚀 Integration test environment initialized with local Supabase");
