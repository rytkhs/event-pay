/**
 * Jest テストセットアップ
 *
 * 決済テスト用の共通セットアップとモック設定
 */

import path from "path";

import * as dotenv from "dotenv";

// Polyfill Web APIs (Request, Response) for Node.js Jest environment
// This must be done before any imports that use next/server
if (typeof globalThis.Request === "undefined") {
  // Use undici's Request/Response if available (Node.js 18+)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Request, Response, Headers } = require("undici");
    globalThis.Request = Request;
    globalThis.Response = Response;
    globalThis.Headers = Headers;
  } catch {
    // Fallback: minimal mocks will be provided by next-server.js mock
    // This is just a safety check - the actual mocks are in tests/mocks/next-server.js
  }
}

// .env.test ファイルを読み込み
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

// NODE_ENVをtestに設定（.env.testで設定済みだが念のため）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process.env as any).NODE_ENV = "test";

// ログレベル設定（テスト時はエラーログのみ - .env.testの設定を上書き）
process.env.LOG_LEVEL = "error";

// Jest timeout設定
jest.setTimeout(30000);

// 未処理のPromise rejectionをエラーとして扱う
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled Rejection:", reason);
  throw reason;
});

// コンソールのログを抑制（テスト結果の見やすさのため）
const originalConsole = { ...console };
beforeAll(() => {
  // eslint-disable-next-line no-console
  // console.log = jest.fn();
  // eslint-disable-next-line no-console
  // console.info = jest.fn();
  // console.warn = jest.fn();
  // エラーログは残す
  console.error = originalConsole.error;
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// Supabase認証モックを設定
import { resetAuthMock } from "./supabase-auth-mock";

// getCurrentUser関数のみをモック化（統合テストでは実際のSupabaseクライアントを使用）
jest.mock("@core/auth/auth-utils", () => ({
  getCurrentUser: jest.fn(),
}));

// 各テスト後にモックをリセット
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  // Supabase認証モックもリセット
  resetAuthMock();
});

export {};
