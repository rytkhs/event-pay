// Jest セットアップファイル
// テスト実行前に必要な設定を行います

// 環境変数の読み込み（.env.localから）
require('dotenv').config({ path: '.env.local' });


// next/headers のモック（Supabase cookies対応）
jest.mock("next/headers", () => {
  const cookieStore = new Map();

  return {
    cookies: jest.fn(() => ({
      get: jest.fn((name) => {
        const value = cookieStore.get(name);
        return value ? { name, value } : undefined;
      }),
      set: jest.fn((name, value, options) => {
        cookieStore.set(name, value);
      }),
      has: jest.fn((name) => {
        return cookieStore.has(name);
      }),
      delete: jest.fn((name) => {
        cookieStore.delete(name);
      }),
      getAll: jest.fn(() => {
        return Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value }));
      }),
      clear: jest.fn(() => {
        cookieStore.clear();
      }),
    })),
  };
});

// テストタイムアウトの設定
jest.setTimeout(30000);

// Supabase接続のテストヘルパー
global.testSupabaseConnection = async () => {
  const { createClient } = require("@supabase/supabase-js");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  try {
    const { data, error } = await supabase.from("users").select("id").limit(1);
    if (error && !error.message.includes("Row level security policy")) {
      console.warn("Supabase接続テスト失敗:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Supabase接続エラー:", err);
    return false;
  }
};

// レート制限ストアのリセット用ヘルパー
global.resetRateLimit = () => {
  // メモリストアのシングルトンをリセット
  const rateLimitModule = require("./lib/rate-limit");
  if (rateLimitModule.resetMemoryStore) {
    rateLimitModule.resetMemoryStore();
  }
};

// テスト前のクリーンアップ
beforeAll(async () => {
  console.log("テスト環境の初期化を開始...");

  // Supabase接続確認
  const isConnected = await global.testSupabaseConnection();
  if (!isConnected) {
    console.warn(
      "⚠️ Supabase接続が確立できません。ローカルSupabaseが起動していることを確認してください。"
    );
    console.warn("次のコマンドを実行してください: npx supabase start");
  }
});

// 各テスト前にレート制限をリセット
beforeEach(() => {
  global.resetRateLimit();
});

afterAll(async () => {
  console.log("テスト環境のクリーンアップを完了しました");
});
