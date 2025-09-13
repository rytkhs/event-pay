import path from "path";
import { fileURLToPath } from "url";

import { test as setup, expect } from "@playwright/test";
import dotenv from "dotenv";

import { createTestUser } from "../helpers/test-user";

// ES Module スコープで __dirname を再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.testファイルのパスを指定
dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  const username = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!username || !password) {
    throw new Error("Test user email or password is not set in .env.test file.");
  }

  // テストユーザーを作成または取得（改善版）
  try {
    console.log(`Creating or retrieving test user: ${username}`);
    await createTestUser(username, password, {
      maxRetries: 5,
      retryDelay: 2000,
    });
    console.log(`✓ Test user ready: ${username}`);
  } catch (error) {
    console.error("Failed to create/retrieve test user:", error);
    throw new Error(`Test setup failed: Unable to create test user ${username}`);
  }

  // ログインページに移動
  await page.goto("/login");

  // デバッグ用に現在のURLを出力
  console.log("Navigated to:", page.url());

  // フォームの要素が表示されるまで待機
  await expect(page.getByLabel("メールアドレス")).toBeVisible({ timeout: 10000 });
  await expect(page.getByLabel("パスワード")).toBeVisible();

  // フォームを入力してログイン
  await page.getByLabel("メールアドレス").fill(username);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();

  // ログイン後のリダイレクト先を待機し、URLを検証
  // ホーム画面にリダイレクトされることを期待
  await expect(page).toHaveURL("/dashboard", { timeout: 15000 });

  // 念のため、ログイン後のページに特定の要素が存在することを確認
  await expect(page.getByRole("heading", { name: "EventPay ダッシュボード" })).toBeVisible();

  // 現在のページの認証状態（CookieやLocalStorage）をファイルに保存
  await page.context().storageState({ path: authFile });
});
