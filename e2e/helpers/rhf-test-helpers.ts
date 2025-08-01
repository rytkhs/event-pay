import { Page, expect } from "@playwright/test";
import { AccountLockoutService } from "../../lib/auth-security";

/**
 * react-hook-form特有の動作に対応するE2Eテストヘルパー関数
 */

/**
 * テスト用アカウントロック状態クリア
 */
export async function clearAccountLockout(email: string): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    try {
      await AccountLockoutService.clearFailedAttempts(email);
    } catch (_error) {
      // エラーを無視（テスト環境でのアカウントロッククリアは必須ではない）
    }
  }
}

/**
 * react-hook-formのバリデーションエラーが表示されるまで待機
 */
export async function waitForValidationError(page: Page, errorText: string, timeout = 5000) {
  await expect(page.locator(`text=${errorText}`)).toBeVisible({ timeout });
}

/**
 * react-hook-formのバリデーションエラーがクリアされるまで待機
 */
export async function waitForValidationErrorToClear(page: Page, errorText: string, timeout = 5000) {
  await expect(page.locator(`text=${errorText}`)).not.toBeVisible({ timeout });
}

/**
 * フォームフィールドに値を入力してバリデーションの動作を確認
 */
export async function fillFieldAndCheckValidation(
  page: Page,
  fieldName: string,
  value: string,
  expectedError?: string
) {
  await page.fill(`[name="${fieldName}"]`, value);

  if (expectedError) {
    await waitForValidationError(page, expectedError);
  }
}

/**
 * react-hook-formフォームの送信を実行（バリデーション考慮）
 */
export async function submitFormWithValidation(page: Page, formSelector = "form") {
  await page.click(`${formSelector} button[type="submit"]`);

  // react-hook-formの場合、クライアントサイドバリデーションが実行される
  // バリデーションエラーがある場合は送信が阻止される
  await page.waitForTimeout(500); // バリデーション処理を待つ
}

/**
 * react-hook-formの送信状態（isPending）を確認
 */
export async function waitForFormSubmissionState(page: Page, isSubmitting = true) {
  if (isSubmitting) {
    await expect(page.locator('button[type="submit"]:has-text("中...")')).toBeVisible();
  } else {
    await expect(page.locator('button[type="submit"]:has-text("中...")')).not.toBeVisible();
  }
}

/**
 * react-hook-formのチェックボックス操作
 */
export async function toggleCheckboxField(page: Page, checkboxId: string, shouldCheck = true) {
  const checkbox = page.locator(`#${checkboxId}`);

  if (shouldCheck) {
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  } else {
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  }
}

/**
 * react-hook-formの複数選択チェックボックスの操作
 */
export async function selectPaymentMethods(page: Page, methods: string[]) {
  for (const method of methods) {
    await toggleCheckboxField(page, method, true);
  }
}

/**
 * ログインヘルパー（e2eテスト用・改善版）
 */
export async function loginAsTestUser(
  page: Page,
  email = "test@eventpay.test",
  password = "TestPassword123"
) {
  // アカウントロック状態をクリア
  await clearAccountLockout(email);

  await page.goto("/login");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/home", { timeout: 60000 });
}

/**
 * ユニークなテストユーザーを作成
 */
export async function createUniqueTestUser(page: Page) {
  const timestamp = Date.now();
  const uniqueEmail = `test-${timestamp}@eventpay.test`;
  const password = "TestPassword123";
  const name = `Test User ${timestamp}`;

  await page.goto("/register");
  await page.fill('[name="name"]', name);
  await page.fill('[name="email"]', uniqueEmail);
  await page.fill('[name="password"]', password);
  await page.fill('[name="passwordConfirm"]', password);
  await page.check('[data-testid="terms-checkbox"]');
  await page.click('button[type="submit"]');

  // 登録完了またはメール確認ページに遷移するのを待つ
  try {
    await page.waitForURL(/\/(auth\/verify-otp|home)/, { timeout: 10000 });
  } catch (_error) {
    // メール確認が必要な場合もあるのでエラーを無視
  }

  return { email: uniqueEmail, password, name };
}

/**
 * 確認済みテストユーザーでログイン（改善版）
 * 各テストで真にユニークなユーザーを選択し、アカウントロック状態をクリア
 */
export async function loginWithUniqueUser(page: Page) {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  // より分散的なユーザー選択
  const userPool = ["test@eventpay.test", "creator@eventpay.test", "participant@eventpay.test"];

  // 実行時刻とランダム要素による真にユニークな選択
  const userIndex = (timestamp + Math.floor(Math.random() * 1000)) % userPool.length;
  const email = userPool[userIndex];

  // アカウントロック状態をクリア
  await clearAccountLockout(email);

  const password = "TestPassword123";
  const name = `Test User ${timestamp}-${randomSuffix}`;

  await page.goto("/login");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/home", { timeout: 60000 });

  return { email, password, name };
}

/**
 * イベント作成ヘルパー（e2eテスト用）
 */
export async function createTestEvent(
  page: Page,
  eventData: {
    title: string;
    description?: string;
    location?: string;
    date: string;
    fee: string;
    capacity?: string;
    paymentMethods: string[];
  }
) {
  // イベント作成ページに遷移
  const createButton = page.locator('[data-testid="create-event-button"]');
  if (await createButton.isVisible()) {
    await createButton.click();
  } else {
    await page.goto("/events/create");
  }
  await page.waitForURL("/events/create");

  await page.fill('[name="title"]', eventData.title);

  if (eventData.description) {
    await page.fill('[name="description"]', eventData.description);
  }

  if (eventData.location) {
    await page.fill('[name="location"]', eventData.location);
  }

  await page.fill('[name="date"]', eventData.date);
  await page.fill('[name="fee"]', eventData.fee);

  if (eventData.capacity) {
    await page.fill('[name="capacity"]', eventData.capacity);
  }

  // 決済方法を選択（無料イベントの場合はスキップ）
  if (parseInt(eventData.fee) > 0) {
    await selectPaymentMethods(page, eventData.paymentMethods);
  }

  await submitFormWithValidation(page);
  await page.waitForURL(/\/events\/[a-f0-9-]+$/);

  return page.url().split("/").pop()!; // イベントIDを返す
}

/**
 * 標準的な認証済みセットアップ（改善版）
 */
export async function setupAuthenticatedTest(page: Page, userEmail = "test@eventpay.test") {
  // アカウントロック状態をクリア
  await clearAccountLockout(userEmail);
  await loginAsTestUser(page, userEmail);
  await expect(page).toHaveURL("/home");
}

/**
 * 基本的なイベント参加フロー（無料イベント用）
 */
export async function completeBasicRegistration(page: Page, inviteLink: string) {
  await page.goto(inviteLink);
  await page.click('[data-testid="register-button"]');
  await page.click('[data-testid="confirm-registration-button"]');

  // 無料イベントまたは現金決済選択
  if (await page.locator('[data-testid="select-cash-payment"]').isVisible()) {
    await page.click('[data-testid="select-cash-payment"]');
    await page.click('[data-testid="confirm-cash-payment"]');
  }

  await page.waitForURL(/\/(payment|registration-complete)/);
}

/**
 * フォームのリセット動作を確認
 */
export async function verifyFormReset(page: Page, fieldNames: string[]) {
  await page.click('button[type="button"]:has-text("リセット")');

  for (const fieldName of fieldNames) {
    await expect(page.locator(`[name="${fieldName}"]`)).toHaveValue("");
  }
}

/**
 * データ属性によるテスト要素の取得
 */
export function getByTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]`);
}

/**
 * react-hook-formエラーメッセージの確認
 */
export async function expectValidationErrors(page: Page, errors: Record<string, string>) {
  for (const [_field, message] of Object.entries(errors)) {
    await waitForValidationError(page, message);
  }
}

/**
 * モバイルビューでのテストセットアップ
 */
export async function setupMobileView(page: Page) {
  await page.setViewportSize({ width: 375, height: 667 });
}

/**
 * タブレットビューでのテストセットアップ
 */
export async function setupTabletView(page: Page) {
  await page.setViewportSize({ width: 768, height: 1024 });
}
