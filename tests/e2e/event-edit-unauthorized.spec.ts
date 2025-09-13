import { test, expect } from "@playwright/test";

import { createTestEvent, deleteTestEvent, type TestEvent } from "../helpers/test-event";
import { createTestUser, type TestUser } from "../helpers/test-user";

test.describe("イベント編集（未権限ユーザーのアクセス制御）", () => {
  let owner: TestUser;
  let other: TestUser;
  let event: TestEvent;

  test.beforeAll(async () => {
    const email1 = `e2e-owner-${Date.now()}@example.com`;
    const email2 = `e2e-other-${Date.now()}@example.com`;
    const password = "Passw0rd!A";

    owner = await createTestUser(email1, password);
    other = await createTestUser(email2, password);

    event = await createTestEvent(owner.id, {
      title: "権限テストイベント",
      fee: 0,
      capacity: null,
    });
  });

  test.afterAll(async () => {
    try {
      if (event) await deleteTestEvent(event.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to cleanup event", event?.id, e);
    }
  });

  test("他ユーザーは /events/[id]/edit にアクセスすると forbidden へリダイレクトされる", async ({
    browser,
    baseURL,
  }) => {
    // 認可は storageState に紐づくため、別コンテキストで other としてログインフロー→storageState を使わずに遷移
    const context = await browser.newContext();
    const page = await context.newPage();

    // ログインページで other でログイン
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill(other.email);
    await page.getByLabel("パスワード").fill(other.password);
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // 他人のイベント編集ページへアクセス
    await page.goto(`/events/${event.id}/edit`);

    // forbidden へリダイレクトされる（URL検証）
    await expect(page).toHaveURL(`${baseURL}/events/${event.id}/forbidden`);

    // forbidden のヘッダ要素が見える
    await expect(page.getByRole("heading", { name: "アクセス権限がありません" })).toBeVisible();

    await context.close();
  });
});
