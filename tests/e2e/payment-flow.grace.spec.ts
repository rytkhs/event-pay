/**
 * 決済フロー E2E - 猶予ON/OFFと最終上限
 */

import { test, expect, type Page } from "@playwright/test";

import { TestDataManager, FIXED_TIME } from "./helpers/test-data-setup";

class PageHelper {
  static async navigateToGuestPage(page: Page, guestToken: string): Promise<void> {
    await page.goto(`/guest/${guestToken}`);
    await page.waitForLoadState("networkidle");
  }
}

test.describe("決済フロー - 猶予と最終上限", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();
  });

  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("猶予OFF: 締切超過で決済ボタンが出ない", async ({ page }) => {
    const attendance = await TestDataManager.createAttendance();
    // event.date = FIXED_TIME + 48h, registration_deadline = +24h
    // payment_deadline を過去日へ（常に期限超過）
    await TestDataManager.updateEventPaymentSettings({
      payment_deadline: "2000-01-01T00:00:00.000Z",
      allow_payment_after_deadline: false,
      grace_period_days: 0,
      status: "upcoming",
    });

    await PageHelper.navigateToGuestPage(page, attendance.guest_token);
    // await expect(page.getByRole("button", { name: "決済を完了する" })).toHaveCount(0);
    const payBtn = page.getByRole("button", { name: "決済を完了する" });
    await expect(payBtn).toBeVisible();
    await expect(payBtn).toBeDisabled();
    await expect(page.getByText(/期限|締切|決済不可|決済は現在できません/)).toBeVisible({
      timeout: 5000,
    });
  });

  test("猶予ON: 締切超過でもfinal内なら決済可能", async ({ page }) => {
    const attendance = await TestDataManager.createAttendance();
    // payment_deadline を過去、ただし final = min(deadline+grace, date+30d) 内にする
    // 例: deadline = FIXED_TIME + 1h (過去基準にするため2000年に), grace = 30d として、date+30d まで許可
    await TestDataManager.updateEventPaymentSettings({
      payment_deadline: new Date(FIXED_TIME.getTime() + 1 * 60 * 60 * 1000).toISOString(),
      allow_payment_after_deadline: true,
      grace_period_days: 30,
      status: "past", // 終了後でも許可（仕様）
    });

    await PageHelper.navigateToGuestPage(page, attendance.guest_token);
    const payButton = page.getByRole("button", { name: "決済を完了する" });
    await expect(payButton).toBeVisible();
    await expect(payButton).toBeEnabled();
  });

  test("最終上限超過: date+30d を超えると決済不可", async ({ page }) => {
    const attendance = await TestDataManager.createAttendance();

    // event.date = FIXED_TIME + 48h
    const eventDatePlus30d = new Date(
      FIXED_TIME.getTime() + 48 * 60 * 60 * 1000 + 30 * 24 * 60 * 60 * 1000
    );
    // const afterFinal = new Date(eventDatePlus30d.getTime() + 1 * 60 * 60 * 1000).toISOString();

    // final を超える状態を作る: deadline を date にし、grace 30d で final = date+30d
    // その後、現在時刻を final より後に固定して検証
    await TestDataManager.updateEventPaymentSettings({
      payment_deadline: new Date(FIXED_TIME.getTime() + 48 * 60 * 60 * 1000).toISOString(), // = date
      allow_payment_after_deadline: true,
      grace_period_days: 30,
      status: "past",
    });

    // 現在時刻を final + 1h にセット
    await page.clock.setFixedTime(new Date(eventDatePlus30d.getTime() + 60 * 60 * 1000));

    await PageHelper.navigateToGuestPage(page, attendance.guest_token);
    // await expect(page.getByRole("button", { name: "決済を完了する" })).toHaveCount(0);
    const payBtn = page.getByRole("button", { name: "決済を完了する" });
    await expect(payBtn).toBeVisible();
    await expect(payBtn).toBeDisabled();
  });
});
