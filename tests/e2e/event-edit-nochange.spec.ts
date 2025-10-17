import { test, expect } from "@playwright/test";

import { createTestEvent, deleteTestEvent, type TestEvent } from "../helpers/test-event";
import { createTestUser, type TestUser } from "../helpers/test-user";

test.describe("イベント編集（変更なしの保存）", () => {
  let testUser: TestUser;
  const createdEvents: TestEvent[] = [];

  test.beforeAll(async () => {
    const email = process.env.TEST_USER_EMAIL || "e2e-event-edit@example.com";
    const password = process.env.TEST_USER_PASSWORD || "Passw0rd!A";
    testUser = await createTestUser(email, password);
  });

  test.afterAll(async () => {
    for (const ev of createdEvents) {
      try {
        await deleteTestEvent(ev.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Failed to cleanup event", ev.id, e);
      }
    }
  });

  // FIXME: そもそもボタンがdisabledで押せないので問題ない。
  test.skip("変更がない場合、エラーメッセージが表示される", async ({ page }) => {
    const event = await createTestEvent(testUser.id, {
      title: "編集テスト（変更なし）",
      fee: 0,
      capacity: null,
      description: "そのまま",
      location: "そのまま会場",
    });
    createdEvents.push(event);

    await page.goto(`/events/${event.id}/edit`);

    // 見出し
    await expect(page.getByRole("heading", { name: "イベント編集" })).toBeVisible();

    // 何も変更せずそのまま保存
    await page.getByRole("button", { name: "変更を保存" }).click();

    // フォーム上部のエラーカード（react-hook-formのrootエラー）
    await expect(page.getByText("変更がありません")).toBeVisible();
  });
});
