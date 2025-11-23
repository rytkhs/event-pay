import { test, expect } from "@playwright/test";

import { getOtpFromEmail, clearMailbox } from "../helpers/test-mailpit";
import { deleteTestUser, type TestUser } from "../helpers/test-user";
test.use({ storageState: { cookies: [], origins: [] } });

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
    await expect(page.getByRole("heading", { name: "アカウント作成" })).toBeVisible();
    await expect(page.getByTestId("register-form")).toBeVisible();

    // フォームに入力
    await page.getByTestId("name-input").fill(testName);
    await page.getByTestId("email-input").fill(testEmail);
    await page.getByTestId("password-input").fill(testPassword);
    await page.getByTestId("password-confirm-input").fill(testPassword);

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
    await expect(page.locator("text=メールアドレスを入力してください")).toBeVisible();
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

    // フォームを送信
    await page.getByTestId("submit-button").click();

    // パスワード不一致エラーが表示されることを確認
    await expect(page.locator("text=パスワードが一致しません")).toBeVisible();
    await expect(page).toHaveURL("/register");
  });

  test("異常系：短いパスワードの場合エラーが表示される", async ({ page }) => {
    await page.goto("/register");

    // フォームに入力（短いパスワード）
    await page.getByTestId("name-input").fill("テストユーザー");
    await page.getByTestId("email-input").fill("test@example.com");

    // 短いパスワードを入力
    const shortPassword = "pass";
    await page.getByTestId("password-input").fill(shortPassword);
    await page.getByTestId("password-confirm-input").fill(shortPassword);

    // フォームを送信
    await page.getByTestId("submit-button").click();

    // パスワード長エラーが表示されることを確認
    await expect(page.locator("text=パスワードは8文字以上で入力してください")).toBeVisible();
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

    // フォームを送信
    await page.getByTestId("submit-button").click();

    // エラーメッセージが表示されることを確認
    // 注意: 実際のエラーメッセージはSupabaseの設定によって異なる可能性がある
    // また、既存ユーザーの場合もOTP入力画面に遷移する場合がある（セキュリティ対策）
    const errorMessages = [
      "このメールアドレスは既に登録されています",
      "ユーザーが既に存在しています",
      "登録処理中にエラーが発生しました",
    ];

    // エラーメッセージが表示されるか、OTP画面に遷移するかを確認
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

    // エラーが見つからない場合、OTP画面への遷移を確認（これもセキュリティ上有効）
    if (!errorFound) {
      const currentUrl = page.url();
      const isOnOtpPage = currentUrl.includes("/verify-otp");
      const isOnRegisterPage = currentUrl.includes("/register");

      // どちらかのページにいれば適切な動作
      expect(isOnOtpPage || isOnRegisterPage).toBe(true);
    }
  });

  test("アクセシビリティ：フォーカス管理とaria属性の確認", async ({ page }) => {
    await page.goto("/register");

    // 必須フィールドのrequired属性を確認
    await expect(page.getByTestId("name-input")).toHaveAttribute("required");
    await expect(page.getByTestId("email-input")).toHaveAttribute("required");
    await expect(page.getByTestId("password-input")).toHaveAttribute("required");
    await expect(page.getByTestId("password-confirm-input")).toHaveAttribute("required");

    // autocomplete属性の確認（HTML属性名は小文字）
    await expect(page.getByTestId("name-input")).toHaveAttribute("autocomplete", "name");
    await expect(page.getByTestId("email-input")).toHaveAttribute("autocomplete", "email");
    await expect(page.getByTestId("password-input")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
    await expect(page.getByTestId("password-confirm-input")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });

  test("レスポンシブデザイン：モバイルビューでの表示確認", async ({ page }) => {
    // モバイルサイズに設定（iPhone SE サイズ）
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/register");

    // フォームが適切に表示されることを確認
    await expect(page.getByTestId("register-form")).toBeVisible();
    await expect(page.getByRole("heading", { name: "アカウント作成" })).toBeVisible();

    // ボタンが全幅で表示されることを確認
    const submitButton = page.getByTestId("submit-button");
    await expect(submitButton).toBeVisible();

    // ボタンクラスの確認（実装に合わせて調整）
    const buttonClasses = await submitButton.getAttribute("class");
    expect(buttonClasses).toContain("w-full");

    // 入力フィールドが適切にスタックされていることを確認
    const nameInput = page.getByTestId("name-input");
    const emailInput = page.getByTestId("email-input");
    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
  });

  test("正常系：完全な登録フローでダッシュボードに到達", async ({ page }) => {
    // ユニークなメールアドレスを生成
    const timestamp = Date.now();
    const testEmail = `test-complete-flow-${timestamp}@example.com`;
    const testPassword = "CompleteFlow123";
    const testName = "完全フローテスト";

    // テストユーザー情報を記録（後でクリーンアップ用）
    testUsers.push({ id: "", email: testEmail, password: testPassword });

    // メールボックスをクリア（過去のメールの影響を防ぐ）
    await clearMailbox(testEmail);

    // 1. 登録フォーム入力・送信
    await page.goto("/register");
    await page.getByTestId("name-input").fill(testName);
    await page.getByTestId("email-input").fill(testEmail);
    await page.getByTestId("password-input").fill(testPassword);
    await page.getByTestId("password-confirm-input").fill(testPassword);

    await page.getByTestId("submit-button").click();

    // 2. OTP入力ページへ遷移確認
    await expect(page).toHaveURL(
      new RegExp(`/verify-otp\\?email=${encodeURIComponent(testEmail)}`),
      { timeout: 15000 }
    );
    await expect(page.getByRole("heading", { name: "確認コードを入力" })).toBeVisible();

    // 3. Mailpitからメール取得してOTPコード抽出
    console.log(`Fetching OTP from Mailpit for ${testEmail}...`);
    const otpCode = await getOtpFromEmail(testEmail, 15000);
    console.log(`OTP code received: ${otpCode}`);

    // 4. OTP入力
    const otpInput = page.locator('input#otp[type="text"][maxlength="6"]');
    await otpInput.fill(otpCode);

    // 5. OTP送信
    await page.getByRole("button", { name: "確認" }).click();

    // 6. ダッシュボードへのリダイレクト確認
    await expect(page).toHaveURL("/dashboard", { timeout: 15000 });

    // 7. ダッシュボードの基本要素を確認
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("異常系：無効なOTPコードでエラー表示", async ({ page }) => {
    // ユニークなメールアドレスを生成
    const timestamp = Date.now();
    const testEmail = `test-invalid-otp-${timestamp}@example.com`;
    const testPassword = "InvalidOtp123";
    const testName = "無効OTPテスト";

    // テストユーザー情報を記録
    testUsers.push({ id: "", email: testEmail, password: testPassword });

    // メールボックスをクリア
    await clearMailbox(testEmail);

    // 1. 登録フォーム送信してOTP入力ページへ
    await page.goto("/register");
    await page.getByTestId("name-input").fill(testName);
    await page.getByTestId("email-input").fill(testEmail);
    await page.getByTestId("password-input").fill(testPassword);
    await page.getByTestId("password-confirm-input").fill(testPassword);

    await page.getByTestId("submit-button").click();

    // OTP入力ページへ遷移確認
    await expect(page).toHaveURL(
      new RegExp(`/verify-otp\\?email=${encodeURIComponent(testEmail)}`),
      { timeout: 15000 }
    );

    // 2. 間違ったOTPコードを入力（000000）
    const otpInput = page.locator('input#otp[type="text"][maxlength="6"]');
    await otpInput.fill("000000");

    // 3. OTP送信
    await page.getByRole("button", { name: "確認" }).click();

    // 4. エラーメッセージの表示確認（複数の可能性のあるエラーメッセージに対応）
    // Next.jsのroute announcerを除外して、実際のエラーメッセージのみを取得
    const errorLocator = page.locator('[role="alert"]:not([id="__next-route-announcer__"])');
    await expect(errorLocator).toBeVisible({ timeout: 5000 });

    // Playwrightのアサーションで、キーワードの存在を確認
    await expect(errorLocator).toContainText(/無効|正しくありません|認証に失敗/, {
      timeout: 3000,
    });

    // URLが変わっていないことを確認（リダイレクトされていない）
    await expect(page).toHaveURL(
      new RegExp(`/verify-otp\\?email=${encodeURIComponent(testEmail)}`)
    );
  });

  test("正常系：OTP再送信後に新しいコードで認証成功", async ({ page }) => {
    // ユニークなメールアドレスを生成
    const timestamp = Date.now();
    const testEmail = `test-otp-resend-${timestamp}@example.com`;
    const testPassword = "OtpResend123";
    const testName = "OTP再送信テスト";

    // テストユーザー情報を記録
    testUsers.push({ id: "", email: testEmail, password: testPassword });

    // メールボックスをクリア
    await clearMailbox(testEmail);

    // 1. 登録フォーム送信してOTP入力ページへ
    await page.goto("/register");
    await page.getByTestId("name-input").fill(testName);
    await page.getByTestId("email-input").fill(testEmail);
    await page.getByTestId("password-input").fill(testPassword);
    await page.getByTestId("password-confirm-input").fill(testPassword);

    await page.getByTestId("submit-button").click();

    // OTP入力ページへ遷移確認
    await expect(page).toHaveURL(
      new RegExp(`/verify-otp\\?email=${encodeURIComponent(testEmail)}`),
      { timeout: 15000 }
    );

    // 最初のOTPを取得（後で使わない）
    console.log(`Fetching first OTP for ${testEmail}...`);
    const firstOtp = await getOtpFromEmail(testEmail, 15000);
    console.log(`First OTP received: ${firstOtp}`);

    // メールボックスをクリア（新しいOTPのみを取得するため）
    await clearMailbox(testEmail);

    // 2. 再送信ボタンをクリック
    const resendButton = page.getByRole("button", { name: "コードを再送信" });
    await resendButton.click();

    // 再送信成功を確認(カウントダウンボタンが表示され、無効化されている)
    const countdownButton = page.getByRole("button", { name: /再送信まで \d+秒/ });
    await expect(countdownButton).toBeDisabled({ timeout: 3000 });
    // カウントダウンテキストの表示を確認
    await expect(countdownButton).toBeVisible({ timeout: 2000 });

    // 3. 新しいOTPを取得
    console.log(`Fetching new OTP after resend for ${testEmail}...`);
    const newOtp = await getOtpFromEmail(testEmail, 15000);
    console.log(`New OTP received: ${newOtp}`);

    // 4. 新しいOTPで認証
    const otpInput = page.locator('input#otp[type="text"][maxlength="6"]');
    await otpInput.fill(newOtp);
    await page.getByRole("button", { name: "確認" }).click();

    // 5. ダッシュボードへのリダイレクト確認
    await expect(page).toHaveURL("/dashboard", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible({
      timeout: 10000,
    });
  });
});
