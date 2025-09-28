import { test, expect } from "@playwright/test";

import { deleteTestUser, type TestUser } from "../helpers/test-user";

test.describe("ユーザー登録フロー（E2E）", () => {
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

  test("正常系：有効な情報でユーザー登録が成功する", async ({ page }) => {
    // ユニークなメールアドレスを生成
    const timestamp = Date.now();
    const testEmail = `test-registration-${timestamp}@example.com`;
    const testPassword = "TestPassword123";
    const testName = "テストユーザー";

    // テストユーザー情報を記録（後でクリーンアップ用）
    testUsers.push({ id: "", email: testEmail, password: testPassword });

    // 登録ページに移動
    await page.goto("/register");
    await expect(page).toHaveURL("/register");

    // ページの基本要素が表示されていることを確認
    await expect(page.getByRole("heading", { name: "会員登録" })).toBeVisible();
    await expect(page.getByTestId("register-form")).toBeVisible();

    // フォームに入力
    await page.getByTestId("name-input").fill(testName);
    await page.getByTestId("email-input").fill(testEmail);
    await page.getByTestId("password-input").fill(testPassword);
    await page.getByTestId("password-confirm-input").fill(testPassword);

    // 利用規約に同意
    await page.getByTestId("terms-checkbox").check();

    // フォームを送信
    await page.getByTestId("submit-button").click();

    // 送信中の状態を確認
    await expect(page.getByTestId("submit-button")).toContainText("登録中...");
    await expect(page.getByTestId("submit-button")).toBeDisabled();

    // メール確認ページにリダイレクトされることを確認
    await expect(page).toHaveURL(
      new RegExp(`/verify-otp\\?email=${encodeURIComponent(testEmail)}`),
      {
        timeout: 15000,
      }
    );

    // メール確認ページの基本要素を確認
    await expect(page.getByRole("heading", { name: "確認コードを入力" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=6桁のコードを入力してください")).toBeVisible();

    // メールアドレスが表示されていることを確認
    await expect(page.locator(`text=${testEmail}`)).toBeVisible();
  });

  test("異常系：必須項目が未入力の場合エラーが表示される", async ({ page }) => {
    await page.goto("/register");

    // 送信ボタンをクリック（何も入力せずに）
    await page.getByTestId("submit-button").click();

    // バリデーションエラーが表示されることを確認
    await expect(page.locator("text=名前を入力してください")).toBeVisible();
    await expect(page.locator("text=有効なメールアドレスを入力してください")).toBeVisible();
    await expect(page.locator("text=パスワードは8文字以上で入力してください")).toBeVisible();

    // フォームが送信されていないことを確認（URLが変わっていない）
    await expect(page).toHaveURL("/register");
  });

  test("異常系：パスワードが一致しない場合エラーが表示される", async ({ page }) => {
    await page.goto("/register");

    // フォームに入力（パスワードのみ不一致）
    await page.getByTestId("name-input").fill("テストユーザー");
    await page.getByTestId("email-input").fill("test@example.com");
    await page.getByTestId("password-input").fill("Password123");
    await page.getByTestId("password-confirm-input").fill("DifferentPassword123");
    await page.getByTestId("terms-checkbox").check();

    // フォームを送信
    await page.getByTestId("submit-button").click();

    // パスワード不一致エラーが表示されることを確認
    await expect(page.locator("text=パスワードが一致しません")).toBeVisible();
    await expect(page).toHaveURL("/register");
  });

  test("異常系：弱いパスワードの場合エラーが表示される", async ({ page }) => {
    await page.goto("/register");

    // フォームに入力（弱いパスワード）
    await page.getByTestId("name-input").fill("テストユーザー");
    await page.getByTestId("email-input").fill("test@example.com");

    // 弱いパスワードを入力
    const weakPassword = "weakpass";
    await page.getByTestId("password-input").fill(weakPassword);
    await page.getByTestId("password-confirm-input").fill(weakPassword);
    await page.getByTestId("terms-checkbox").check();

    // フォームを送信
    await page.getByTestId("submit-button").click();

    // パスワード強度エラーが表示されることを確認
    await expect(
      page.locator("text=パスワードは大文字・小文字・数字を含む必要があります")
    ).toBeVisible();
    await expect(page).toHaveURL("/register");
  });

  test("異常系：利用規約に同意しない場合エラーが表示される", async ({ page }) => {
    await page.goto("/register");

    // フォームに入力（利用規約のチェックを外す）
    await page.getByTestId("name-input").fill("テストユーザー");
    await page.getByTestId("email-input").fill("test@example.com");
    await page.getByTestId("password-input").fill("TestPassword123");
    await page.getByTestId("password-confirm-input").fill("TestPassword123");
    // 利用規約チェックボックスは意図的にチェックしない

    // フォームを送信
    await page.getByTestId("submit-button").click();

    // 利用規約同意エラーが表示されることを確認
    await expect(page.getByTestId("terms-error")).toBeVisible();
    await expect(page.getByTestId("terms-error")).toContainText("利用規約に同意してください");
    await expect(page).toHaveURL("/register");
  });

  test("異常系：既に登録済みのメールアドレスで登録しようとした場合", async ({ page }) => {
    // 既存のテストユーザーのメールアドレスを使用
    // 注意: 実際の既存ユーザーがいる場合のテストなので、
    // テスト環境に合わせて調整が必要な場合がある
    const existingEmail = process.env.TEST_USER_EMAIL || "test-e2e@example.com";

    await page.goto("/register");

    // 既存のメールアドレスでフォームを入力
    await page.getByTestId("name-input").fill("テストユーザー");
    await page.getByTestId("email-input").fill(existingEmail);
    await page.getByTestId("password-input").fill("TestPassword123");
    await page.getByTestId("password-confirm-input").fill("TestPassword123");
    await page.getByTestId("terms-checkbox").check();

    // フォームを送信
    await page.getByTestId("submit-button").click();

    // エラーメッセージが表示されることを確認
    // 注意: 実際のエラーメッセージはSupabaseの設定によって異なる可能性がある
    const errorMessages = [
      "このメールアドレスは既に登録されています",
      "ユーザーが既に存在しています",
      "登録処理中にエラーが発生しました",
    ];

    let errorFound = false;
    for (const message of errorMessages) {
      try {
        await expect(page.locator(`text=${message}`)).toBeVisible({ timeout: 2000 });
        errorFound = true;
        break;
      } catch {
        // このメッセージは表示されていない、次のメッセージをチェック
      }
    }

    expect(errorFound).toBe(true);

    await expect(page).toHaveURL("/register");
  });

  test("UIテスト：パスワード強度インジケーターの動作を確認", async ({ page }) => {
    await page.goto("/register");

    const passwordInput = page.getByTestId("password-input");

    // 弱いパスワード
    await passwordInput.fill("weak");
    await expect(page.locator("text=強度: 弱い")).toBeVisible();
    await expect(page.locator(".text-red-500")).toBeVisible();

    // 中程度のパスワード
    await passwordInput.fill("WeakPass1");
    await expect(page.locator("text=強度: 普通")).toBeVisible();
    await expect(page.locator(".text-yellow-500")).toBeVisible();

    // 強いパスワード
    await passwordInput.fill("StrongPass123");
    await expect(page.locator("text=強度: とても強い")).toBeVisible();
    await expect(page.locator(".text-green-600")).toBeVisible();
  });

  test("アクセシビリティ：フォーカス管理とaria属性の確認", async ({ page }) => {
    await page.goto("/register");

    // 利用規約チェックボックスのaria属性を確認
    const termsCheckbox = page.getByTestId("terms-checkbox");
    await expect(termsCheckbox).toHaveAttribute("aria-required", "true");
    await expect(termsCheckbox).toHaveAttribute("aria-describedby", "terms-description");

    // 必須フィールドのrequired属性を確認
    await expect(page.getByTestId("name-input")).toHaveAttribute("required");
    await expect(page.getByTestId("email-input")).toHaveAttribute("required");
    await expect(page.getByTestId("password-input")).toHaveAttribute("required");
    await expect(page.getByTestId("password-confirm-input")).toHaveAttribute("required");

    // autocomplete属性の確認
    await expect(page.getByTestId("name-input")).toHaveAttribute("autoComplete", "name");
    await expect(page.getByTestId("email-input")).toHaveAttribute("autoComplete", "email");
    await expect(page.getByTestId("password-input")).toHaveAttribute(
      "autoComplete",
      "new-password"
    );
    await expect(page.getByTestId("password-confirm-input")).toHaveAttribute(
      "autoComplete",
      "new-password"
    );
  });

  test("レスポンシブデザイン：モバイルビューでの表示確認", async ({ page }) => {
    // モバイルサイズに設定
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/register");

    // フォームが適切に表示されることを確認
    await expect(page.getByTestId("register-form")).toBeVisible();
    await expect(page.getByRole("heading", { name: "会員登録" })).toBeVisible();

    // ボタンが全幅で表示されることを確認
    const submitButton = page.getByTestId("submit-button");
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveClass(/w-full/);

    // カードコンポーネントが適切に表示されることを確認
    await expect(page.locator(".max-w-md")).toBeVisible();
  });
});
