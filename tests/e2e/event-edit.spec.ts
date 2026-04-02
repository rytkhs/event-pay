import { test, expect } from "@playwright/test";

import { createTestEvent, deleteTestEvent, type TestEvent } from "../helpers/test-event";
import { createTestUser, type TestUser } from "../helpers/test-user";

test.describe("イベント編集（E2E）", () => {
  let testUser: TestUser;
  const createdEvents: TestEvent[] = [];

  test.beforeAll(async () => {
    const email = process.env.TEST_USER_EMAIL || "e2e-event-edit@example.com";
    const password = process.env.TEST_USER_PASSWORD || "Passw0rd!A";

    // テストユーザーを作成/取得（認証は setup プロジェクトで storageState 済み）
    testUser = await createTestUser(email, password);
  });

  test.afterAll(async () => {
    // 作成したイベントをクリーンアップ
    for (const ev of createdEvents) {
      try {
        await deleteTestEvent(ev.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Failed to cleanup event", ev.id, e);
      }
    }
  });

  test("正常系: 場所/説明を更新し、詳細に反映される", async ({ page }) => {
    // 事前にイベントを作成（無料イベント、参加者なし）
    const event = await createTestEvent(testUser.id, {
      title: "編集テストイベント",
      fee: 0,
      capacity: null,
    });
    createdEvents.push(event);

    // 編集ページへ
    await page.goto(`/events/${event.id}/edit`);

    // 現行UIではページ見出しの代わりに最初のセクション見出しが表示される
    await expect(page.getByRole("heading", { name: "基本情報" })).toBeVisible();

    // 入力値を変更（場所・説明）
    await page.getByPlaceholder("例：〇〇会議室、〇〇居酒屋など").fill("新しい会場A");
    await page
      .getByRole("textbox", { name: "イベントの説明・詳細（任意）" })
      .fill("更新済みの説明テキストA");

    // 変更を保存 → 確認ダイアログで確定
    await page.getByRole("button", { name: "変更を保存" }).click();
    await expect(page.getByText("変更内容を確認")).toBeVisible();
    await page.getByRole("button", { name: "変更を確定" }).click();

    // 詳細ページへ遷移
    await expect(page).toHaveURL(`/events/${event.id}`);

    // 変更が反映されていることを確認
    await expect(page.getByText("新しい会場A").first()).toBeVisible(); // 開催場所
    await expect(page.getByText("更新済みの説明テキストA")).toBeVisible(); // 詳細説明
  });
});
