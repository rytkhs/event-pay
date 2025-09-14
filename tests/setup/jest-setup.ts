/**
 * Jest テストセットアップ
 *
 * 決済テスト用の共通セットアップとモック設定
 */

import path from "path";

import * as dotenv from "dotenv";

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
  console.log = jest.fn();
  // eslint-disable-next-line no-console
  console.info = jest.fn();
  console.warn = jest.fn();
  // エラーログは残す
  console.error = originalConsole.error;
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// 各テスト後にモックをリセット
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

export {};
