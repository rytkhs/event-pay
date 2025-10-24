import { test, expect } from "@playwright/test";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import type { Database } from "@/types/database";

import {
  createTestEventWithParticipants,
  deleteTestEvent,
  type TestEvent,
} from "../helpers/test-event";
import {
  createTestAttendance,
  createPaidTestEvent as createPaidEventForPayments,
} from "../helpers/test-payment-data";
import { createTestUser, type TestUser } from "../helpers/test-user";

test.describe("イベント編集 V2（E2E）", () => {
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

  test("参加者がいても基本項目は編集できる", async ({ page }) => {
    const event = await createTestEventWithParticipants(testUser.id, { fee: 0 }, 2);
    createdEvents.push(event);

    await page.goto(`/events/${event.id}/edit`);

    await page.getByLabel("場所").fill("編集後の会場");
    await page.getByLabel("説明").fill("編集後の説明");

    // 保存 → 確認 → 確定
    await page.getByRole("button", { name: "変更を保存" }).click();
    await expect(page.getByText("変更内容を確認")).toBeVisible();
    await page.getByRole("button", { name: "変更を確定" }).click();

    await expect(page).toHaveURL(`/events/${event.id}`);
    await expect(page.getByText("編集後の会場")).toBeVisible();
    await expect(page.getByText("編集後の説明")).toBeVisible();
  });

  test("Stripe決済済みがいると fee/payment_methods が編集不可", async ({ page }) => {
    // 有料イベントを作成
    const paid = await createPaidEventForPayments(testUser.id, { fee: 1200 });
    const event: TestEvent = {
      id: paid.id,
      title: paid.title,
      date: paid.date,
      fee: paid.fee,
      capacity: paid.capacity,
      invite_token: paid.invite_token,
      created_by: paid.created_by,
      payment_methods: paid.payment_methods,
    };
    createdEvents.push(event);

    // 参加者作成 + payments に paid を1件作る
    const attendance = await createTestAttendance(event.id, {});

    const adminClient = await SecureSupabaseClientFactory.create().createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      `Insert paid payment for event ${event.id}`,
      {
        operationType: "INSERT",
        accessedTables: ["public.payments"],
      }
    );

    const payment: Database["public"]["Tables"]["payments"]["Insert"] = {
      attendance_id: attendance.id,
      amount: event.fee,
      status: "paid",
      method: "stripe",
      application_fee_amount: Math.floor((event.fee || 0) * 0.1),
      tax_included: false,
    } as any;

    const { error } = await adminClient.from("payments").insert(payment).select().single();
    if (error) throw new Error(`failed to insert paid payment: ${error.message}`);

    // 編集ページへ
    await page.goto(`/events/${event.id}/edit`);

    // 参加費と決済方法が編集不可
    await expect(page.getByLabel("参加費（円） *")).toBeDisabled();
    const pmStripe = page.locator("#payment-stripe");
    const pmCash = page.locator("#payment-cash");
    await expect(pmStripe).toBeDisabled();
    await expect(pmCash).toBeDisabled();
  });

  test("定員は参加者数未満にできない", async ({ page }) => {
    const event = await createTestEventWithParticipants(testUser.id, { fee: 0, capacity: 5 }, 3);
    createdEvents.push(event);

    await page.goto(`/events/${event.id}/edit`);

    await page.getByLabel("定員").fill("2");
    await expect(page.getByText(/定員は現在の参加者数（3名）以上で設定してください/)).toBeVisible();
    await expect(page.getByRole("button", { name: "変更を保存" })).toBeDisabled();
  });
});
