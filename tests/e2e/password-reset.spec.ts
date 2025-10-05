import { test, expect } from "@playwright/test";

import { getPasswordResetLinkFromEmail, clearMailbox } from "../helpers/mailpit-helper";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/test-user";

// 認証なしでアクセス
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("パスワードリセットフロー（E2E）", () => {
  const testUsers: TestUser[] = [];

  test.afterAll(async () => {
    // テストで作成したユーザーをクリーンアップ
    for (const user of testUsers) {
      try {
        await deleteTestUser(user.email);
        console.log(`✓ Cleaned up test user: ${user.email}`);
      } catch (error) {
        console.error(`Failed to delete test user ${user.email}:`, error);
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    // デバッグ用のコンソールログを有効化
    page.on("console", (msg) => console.log("Browser console:", msg.text()));
  });

  test("正常系：完全なパスワードリセットフロー", async ({ page }) => {
    // ユニークなメールアドレスを生成
    const timestamp = Date.now();
    const testEmail = `test-password-reset-${timestamp}@example.com`;
    const originalPassword = "OriginalPassword123";
    const newPassword = "NewPassword456";

    // テストユーザーを作成（事前に認証済みユーザーが必要）
    console.log(`Creating test user: ${testEmail}`);
    const testUser = await createTestUser(testEmail, originalPassword);
    testUsers.push(testUser);
    console.log(`✓ Test user created: ${testEmail}`);

    // メールボックスをクリア
    await clearMailbox(testEmail);

    // Step 1: パスワードリセットページにアクセス
    await page.goto("/reset-password");
    await expect(page).toHaveURL("/reset-password");

    // ページの基本要素が表示されていることを確認
    await expect(page.getByRole("heading", { name: "パスワードリセット" })).toBeVisible();
    await expect(page.getByTestId("reset-password-form")).toBeVisible();

    // Step 2: メールアドレスを入力してリセットメールを送信
    await page.getByLabel("メールアドレス").fill(testEmail);
    await page.getByRole("button", { name: "リセットメール送信" }).click();

    // Step 3: 成功メッセージの確認（セキュリティ上、常に同じメッセージ）
    await expect(page.locator("text=パスワードリセットメールを送信しました")).toBeVisible({
      timeout: 10000,
    });

    // Step 4: Mailpitからリセットリンクを取得
    console.log(`Fetching password reset link from Mailpit for ${testEmail}...`);
    const resetLink = await getPasswordResetLinkFromEmail(testEmail, 15000);
    console.log(`Password reset link received: ${resetLink}`);

    // リンクからパスを抽出（絶対URLの場合）
    let resetPath = resetLink;
    if (resetLink.startsWith("http")) {
      const url = new URL(resetLink);
      resetPath = url.pathname + url.search;
    }

    // Step 5: リセットリンクにアクセス
    await page.goto(resetPath);
    await expect(page).toHaveURL(new RegExp("/reset-password/update"));

    // パスワード更新ページの基本要素を確認
    await expect(page.getByRole("heading", { name: "新しいパスワードの設定" })).toBeVisible({
      timeout: 10000,
    });

    // Step 6: 新しいパスワードを入力
    await page.getByLabel("新しいパスワード", { exact: true }).fill(newPassword);
    await page.getByLabel("新しいパスワード（確認）").fill(newPassword);

    // Step 7: パスワード更新ボタンをクリック
    await page.getByRole("button", { name: "パスワード更新" }).click();

    // Step 8: ダッシュボードへのリダイレクト確認
    await expect(page).toHaveURL("/dashboard", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible({
      timeout: 10000,
    });

    // Step 9: ログアウト
    await page.getByRole("button", { name: "ログアウト" }).click();
    await expect(page).toHaveURL("/login", { timeout: 10000 });

    // Step 10: 新しいパスワードでログイン成功を確認
    await page.getByLabel("メールアドレス").fill(testEmail);
    await page.getByLabel("パスワード").fill(newPassword);
    await page.getByRole("button", { name: "ログイン" }).click();

    // ログイン成功を確認
    await expect(page).toHaveURL("/dashboard", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
  });

  test("異常系：無効なメールアドレス", async ({ page }) => {
    await page.goto("/reset-password");

    // 空のメールアドレスで送信
    await page.getByRole("button", { name: "リセットメール送信" }).click();

    // バリデーションエラーが表示されることを確認
    await expect(page.locator("text=有効なメールアドレスを入力してください")).toBeVisible();

    // フォームが送信されていないことを確認（URLが変わっていない）
    await expect(page).toHaveURL("/reset-password");
  });

  test("異常系：無効なトークンでアクセス", async ({ page }) => {
    // 改ざんされたトークン付きURLにアクセス
    await page.goto("/reset-password/update?code=invalid123token&type=recovery");

    // パスワード入力フォームが表示されることを確認（Supabaseが内部で検証）
    await expect(page.getByRole("heading", { name: "新しいパスワードの設定" })).toBeVisible({
      timeout: 10000,
    });

    // 新しいパスワードを入力して送信
    const testPassword = "TestPassword123";
    await page.getByLabel("新しいパスワード", { exact: true }).fill(testPassword);
    await page.getByLabel("新しいパスワード（確認）").fill(testPassword);
    await page.getByRole("button", { name: "パスワード更新" }).click();

    // エラーメッセージが表示されることを確認
    // 注意: 無効なトークンの場合、Supabaseがセッションを作成できないため、
    // updateUser()が失敗するか、認証エラーになる
    await expect(page.locator("text=パスワードの更新に失敗しました")).toBeVisible({
      timeout: 5000,
    });
  });

  test("異常系：パスワード確認不一致", async ({ page }) => {
    // 有効なテストユーザーを作成してリセットリンクを取得
    const timestamp = Date.now();
    const testEmail = `test-pwd-mismatch-${timestamp}@example.com`;
    const originalPassword = "OriginalPassword123";

    console.log(`Creating test user for mismatch test: ${testEmail}`);
    const testUser = await createTestUser(testEmail, originalPassword);
    testUsers.push(testUser);

    await clearMailbox(testEmail);

    // パスワードリセットリクエスト
    await page.goto("/reset-password");
    await page.getByLabel("メールアドレス").fill(testEmail);
    await page.getByRole("button", { name: "リセットメール送信" }).click();

    // リセットリンクを取得してアクセス
    console.log(`Fetching reset link for mismatch test...`);
    const resetLink = await getPasswordResetLinkFromEmail(testEmail, 15000);
    let resetPath = resetLink;
    if (resetLink.startsWith("http")) {
      const url = new URL(resetLink);
      resetPath = url.pathname + url.search;
    }

    await page.goto(resetPath);
    await expect(page).toHaveURL(new RegExp("/reset-password/update"));

    // 不一致のパスワードを入力
    await page.getByLabel("新しいパスワード", { exact: true }).fill("NewPassword123");
    await page.getByLabel("新しいパスワード（確認）").fill("DifferentPassword456");

    // パスワード更新ボタンをクリック
    await page.getByRole("button", { name: "パスワード更新" }).click();

    // パスワード不一致エラーが表示されることを確認
    await expect(page.locator("text=パスワードが一致しません")).toBeVisible();

    // URLが変わっていないことを確認
    await expect(page).toHaveURL(new RegExp("/reset-password/update"));
  });

  test("異常系：パスワード強度要件違反（短いパスワード）", async ({ page }) => {
    // 有効なテストユーザーを作成してリセットリンクを取得
    const timestamp = Date.now();
    const testEmail = `test-weak-pwd-${timestamp}@example.com`;
    const originalPassword = "OriginalPassword123";

    console.log(`Creating test user for weak password test: ${testEmail}`);
    const testUser = await createTestUser(testEmail, originalPassword);
    testUsers.push(testUser);

    await clearMailbox(testEmail);

    // パスワードリセットリクエスト
    await page.goto("/reset-password");
    await page.getByLabel("メールアドレス").fill(testEmail);
    await page.getByRole("button", { name: "リセットメール送信" }).click();

    // リセットリンクを取得してアクセス
    console.log(`Fetching reset link for weak password test...`);
    const resetLink = await getPasswordResetLinkFromEmail(testEmail, 15000);
    let resetPath = resetLink;
    if (resetLink.startsWith("http")) {
      const url = new URL(resetLink);
      resetPath = url.pathname + url.search;
    }

    await page.goto(resetPath);
    await expect(page).toHaveURL(new RegExp("/reset-password/update"));

    // 短いパスワードを入力（7文字）
    const weakPassword = "short";
    await page.getByLabel("新しいパスワード", { exact: true }).fill(weakPassword);
    await page.getByLabel("新しいパスワード（確認）").fill(weakPassword);

    // パスワード更新ボタンをクリック
    await page.getByRole("button", { name: "パスワード更新" }).click();

    // パスワード長エラーが表示されることを確認
    await expect(page.locator("text=パスワードは8文字以上で入力してください")).toBeVisible();

    // URLが変わっていないことを確認
    await expect(page).toHaveURL(new RegExp("/reset-password/update"));
  });

  test("異常系：パスワード強度要件違反（大文字・小文字・数字なし）", async ({ page }) => {
    // 有効なテストユーザーを作成してリセットリンクを取得
    const timestamp = Date.now();
    const testEmail = `test-no-complexity-${timestamp}@example.com`;
    const originalPassword = "OriginalPassword123";

    console.log(`Creating test user for complexity test: ${testEmail}`);
    const testUser = await createTestUser(testEmail, originalPassword);
    testUsers.push(testUser);

    await clearMailbox(testEmail);

    // パスワードリセットリクエスト
    await page.goto("/reset-password");
    await page.getByLabel("メールアドレス").fill(testEmail);
    await page.getByRole("button", { name: "リセットメール送信" }).click();

    // リセットリンクを取得してアクセス
    console.log(`Fetching reset link for complexity test...`);
    const resetLink = await getPasswordResetLinkFromEmail(testEmail, 15000);
    let resetPath = resetLink;
    if (resetLink.startsWith("http")) {
      const url = new URL(resetLink);
      resetPath = url.pathname + url.search;
    }

    await page.goto(resetPath);
    await expect(page).toHaveURL(new RegExp("/reset-password/update"));

    // 複雑性要件を満たさないパスワードを入力（小文字のみ）
    const simplePassword = "alllowercase";
    await page.getByLabel("新しいパスワード", { exact: true }).fill(simplePassword);
    await page.getByLabel("新しいパスワード（確認）").fill(simplePassword);

    // パスワード更新ボタンをクリック
    await page.getByRole("button", { name: "パスワード更新" }).click();

    // 複雑性要件エラーが表示されることを確認
    await expect(
      page.locator("text=パスワードは大文字・小文字・数字を含む必要があります")
    ).toBeVisible();

    // URLが変わっていないことを確認
    await expect(page).toHaveURL(new RegExp("/reset-password/update"));
  });
});
