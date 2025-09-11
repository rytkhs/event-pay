import { test, expect } from "@playwright/test";

import {
  createTestEventWithParticipants,
  deleteTestEvent,
  type TestEvent,
} from "../helpers/test-event";
import { createTestUser, type TestUser } from "../helpers/test-user";

test.describe("イベント編集（参加者ありの編集制限）", () => {
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

  test("参加者がいると、タイトル/参加費/決済方法は編集不可", async ({ page }) => {
    const event = await createTestEventWithParticipants(
      testUser.id,
      { fee: 1000, payment_methods: ["stripe"] },
      1
    );
    createdEvents.push(event);

    await page.goto(`/events/${event.id}/edit`);

    // 注意表示
    await expect(
      page.getByText("参加者がいるため、一部項目の編集が制限されています")
    ).toBeVisible();

    // タイトル、参加費、決済方法が編集不可（disabledなど）を概ね確認
    await expect(page.getByLabel("タイトル *")).toBeDisabled();
    await expect(page.getByLabel("参加費（円） *")).toBeDisabled();

    // 決済方法のチェックボックスは disabled
    const pmStripe = page.locator("#payment-stripe");
    const pmCash = page.locator("#payment-cash");
    await expect(pmStripe).toBeDisabled();
    await expect(pmCash).toBeDisabled();
  });

  test("定員は現在の参加者数未満にできない", async ({ page }) => {
    const event = await createTestEventWithParticipants(testUser.id, { fee: 0, capacity: 5 }, 3);
    createdEvents.push(event);

    await page.goto(`/events/${event.id}/edit`);
    // 定員に 2（参加者3名より小さい）を入れるとクライアント側で即時エラー表示、保存不可
    await page.getByLabel("定員").fill("2");

    // エラーメッセージ（フォームフィールドのメッセージ）
    await expect(page.getByText(/定員は現在の参加者数（3名）以上で設定してください/)).toBeVisible();

    // 変更を保存 ボタンは disabled（フォームが無効）
    await expect(page.getByRole("button", { name: "変更を保存" })).toBeDisabled();
  });
});
