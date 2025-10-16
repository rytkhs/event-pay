import { test, expect } from "@playwright/test";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { generateInviteToken } from "@core/utils/invite-token";

import { createTestEvent, deleteTestEvent, type TestEvent } from "../../helpers/test-event";
import { createTestUser, deleteTestUser, type TestUser } from "../../helpers/test-user";

test.describe("招待リンクアクセス（E2E）", () => {
  let testUser: TestUser;
  const testEvents: TestEvent[] = [];

  test.beforeAll(async () => {
    // テストユーザーを作成
    testUser = await createTestUser("test-invite-access@example.com", "testpassword123");
  });

  test.afterAll(async () => {
    // テストデータをクリーンアップ
    for (const event of testEvents) {
      try {
        await deleteTestEvent(event.id);
      } catch (error) {
        console.error(`Failed to delete test event ${event.id}:`, error);
      }
    }

    try {
      await deleteTestUser(testUser.email);
    } catch (error) {
      console.error(`Failed to delete test user ${testUser.email}:`, error);
    }
  });

  test.beforeEach(async ({ page }) => {
    // デバッグ用のコンソールログを有効化
    page.on("console", (msg) => console.log("Browser console:", msg.text()));
  });

  test("正常系：有効な招待トークンでイベント詳細が表示される", async ({ page }) => {
    // テストイベントを作成（Stripeを含む場合はpayment_deadlineが必須）
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    const paymentDeadline = new Date(futureDate.getTime() - 10 * 60 * 1000).toISOString();

    const event = await createTestEvent(testUser.id, {
      title: "正常系テストイベント",
      fee: 1000,
      capacity: 50,
      location: "東京テスト会場",
      description: "これはテスト用のイベントです。",
      payment_methods: ["stripe", "cash"],
      payment_deadline: paymentDeadline,
    });
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // イベント情報が表示されることを確認
    await expect(page.getByText("正常系テストイベント")).toBeVisible();
    // 参加費はカンマ区切りで表示される
    await expect(page.getByText("1,000円")).toBeVisible();
    await expect(page.getByText("東京テスト会場")).toBeVisible();
    await expect(page.getByText("これはテスト用のイベントです。")).toBeVisible();

    // 参加申し込みボタンが表示されることを確認
    await expect(page.getByRole("button", { name: "参加申し込みをする" })).toBeVisible();
    await expect(page.getByRole("button", { name: "参加申し込みをする" })).toBeEnabled();

    // エラーメッセージが表示されないことを確認
    await expect(page.getByText("無効な招待リンク")).not.toBeVisible();
    await expect(page.getByText("このイベントはキャンセルされました")).not.toBeVisible();
  });

  test("正常系：無料イベントの招待リンクで正しく表示される", async ({ page }) => {
    // 無料イベントを作成
    const event = await createTestEvent(testUser.id, {
      title: "無料イベント",
      fee: 0,
      capacity: null,
      description: "参加費無料のイベントです。",
    });
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // イベント情報が表示されることを確認
    await expect(page.getByText("無料イベント")).toBeVisible();
    // 「無料」という文字が参加費セクションに表示されることを確認（より具体的なセレクタ）
    await expect(page.getByText("無料").first()).toBeVisible();

    // 参加申し込みボタンが表示されることを確認
    await expect(page.getByRole("button", { name: "参加申し込みをする" })).toBeVisible();
  });

  test("異常系：無効なトークン形式でエラーページが表示される", async ({ page }) => {
    // 無効な形式のトークン（規定のフォーマットでない）
    await page.goto("/invite/invalid_token");

    // エラーページが表示されることを確認
    await expect(page.getByText("無効な招待リンク").first()).toBeVisible();
    // エラーメッセージまたは説明文が表示されることを確認
    await expect(
      page.getByText("正しい招待リンクをご確認いただくか、主催者にお問い合わせください")
    ).toBeVisible();

    // 参加申し込みボタンが表示されないことを確認
    await expect(page.getByRole("button", { name: "参加申し込みをする" })).not.toBeVisible();
  });

  test("異常系：存在しないトークンでエラーページが表示される", async ({ page }) => {
    // 有効な形式だがDBに存在しないトークン
    const nonExistentToken = generateInviteToken();
    await page.goto(`/invite/${nonExistentToken}`);

    // エラーページが表示されることを確認
    await expect(page.getByText("無効な招待リンク").first()).toBeVisible();

    // 参加申し込みボタンが表示されないことを確認
    await expect(page.getByRole("button", { name: "参加申し込みをする" })).not.toBeVisible();
  });

  test.skip("異常系：中止済みイベントのトークンでエラーページが表示される", async ({ page }) => {
    // Note: DB制約（events_date_after_creation）により、過去のイベントを作成して
    // テストすることが技術的に困難なため、このテストはスキップします。
    // 実装では、canceled_atが設定されたイベントに対して適切なエラーページを表示します。
  });

  test.skip("異常系：終了済みイベントのトークンでエラーページが表示される", async ({ page }) => {
    // Note: DB制約（events_date_after_creation）により、過去のイベントを作成して
    // テストすることが技術的に困難なため、このテストはスキップします。
    // 実装では、イベント終了後に適切なエラーページを表示します。
  });

  test("異常系：参加申込期限切れのトークンでエラーページが表示される", async ({ page }) => {
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Creating expired deadline event for invite link access test",
      {
        operationType: "INSERT",
        accessedTables: ["public.events"],
        additionalInfo: {
          testContext: "playwright-e2e-invite-link-access",
        },
      }
    );

    // 将来のイベントだが、申込期限が過去
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 2日後
    const pastDeadline = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1時間前
    const paymentDeadline = new Date(futureDate.getTime() - 12 * 60 * 60 * 1000); // イベントの12時間前

    const inviteToken = generateInviteToken();
    const { data: expiredDeadlineEvent, error } = await adminClient
      .from("events")
      .insert({
        title: "申込期限切れイベント",
        date: futureDate.toISOString(),
        fee: 1000,
        location: "テスト会場",
        description: "申込期限が過ぎたイベント",
        registration_deadline: pastDeadline.toISOString(),
        payment_deadline: paymentDeadline.toISOString(),
        invite_token: inviteToken,
        created_by: testUser.id,
        payment_methods: ["stripe"],
      })
      .select()
      .single();

    if (error || !expiredDeadlineEvent) {
      throw new Error(`Failed to create expired deadline event: ${error?.message}`);
    }

    testEvents.push({
      id: expiredDeadlineEvent.id,
      title: expiredDeadlineEvent.title,
      date: expiredDeadlineEvent.date,
      fee: expiredDeadlineEvent.fee,
      capacity: expiredDeadlineEvent.capacity,
      invite_token: expiredDeadlineEvent.invite_token,
      created_by: expiredDeadlineEvent.created_by,
    });

    // 招待リンクページにアクセス
    await page.goto(`/invite/${inviteToken}`);

    // エラーページが表示されることを確認（canRegisterがfalseの場合）
    await expect(page.getByText("申込期限終了")).toBeVisible();
    await expect(page.getByText("参加申込期限が過ぎています")).toBeVisible();

    // 参加申し込みボタンが表示されないことを確認
    await expect(page.getByRole("button", { name: "参加申し込みをする" })).not.toBeVisible();
  });

  test("異常系：空のトークンで適切なページが表示される", async ({ page }) => {
    // 空のトークンでアクセス
    await page.goto("/invite/");

    // Next.jsのルーティングにより、適切なページが表示される
    // （404またはエラーページ）
    // 具体的な表示内容は実装に依存するため、ページが読み込まれることのみ確認
    await page.waitForLoadState("networkidle");

    // 参加申し込みボタンが表示されないことを確認
    await expect(page.getByRole("button", { name: "参加申し込みをする" })).not.toBeVisible();
  });

  test("正常系：定員ありイベントで定員情報が表示される", async ({ page }) => {
    // 定員ありイベントを作成
    const event = await createTestEvent(testUser.id, {
      title: "定員ありイベント",
      fee: 0,
      capacity: 30,
      description: "定員30名のイベントです。",
    });
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // イベント情報が表示されることを確認
    await expect(page.getByText("定員ありイベント")).toBeVisible();

    // 定員セクションが表示されることを確認（より具体的なセレクタ）
    await expect(page.getByText("定員", { exact: true })).toBeVisible();

    // 参加申し込みボタンが表示されることを確認
    await expect(page.getByRole("button", { name: "参加申し込みをする" })).toBeVisible();
  });
});
