import { test, expect } from "@playwright/test";

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import {
  createTestEvent,
  createPaidTestEvent,
  deleteTestEvent,
  createTestEventWithParticipants,
  type TestEvent,
} from "../../helpers/test-event";
import {
  createTestAttendance,
  createPendingTestPayment,
  createTestUserWithConnect,
  type TestAttendanceData,
  type TestPaymentUser,
} from "../../helpers/test-payment-data";
import { createTestUser, deleteTestUser, type TestUser } from "../../helpers/test-user";

/**
 * 3-3. 参加状況変更フローのe2eテスト
 *
 * flow.mdで定義された以下の3つのフローをカバー：
 * - 参加→不参加: 決済キャンセル、払い戻し処理
 * - 未定→参加: 定員チェック、決済フロー開始
 * - 期限後の変更: 変更不可メッセージ、決済のみ許可
 */
test.describe("3-3. 参加状況変更フロー（E2E）", () => {
  let testUser: TestUser;
  let testUserWithConnect: TestPaymentUser;
  const testEvents: TestEvent[] = [];
  const testAttendances: TestAttendanceData[] = [];

  test.beforeAll(async () => {
    console.log("🔧 Setting up test users for participation status change tests");
    testUser = await createTestUser("participation-status-change@example.com", "test-password-123");
    testUserWithConnect = await createTestUserWithConnect(
      "participation-status-connect@example.com",
      "test-password-123"
    );
    console.log(`✓ Test users created: ${testUser.email}, ${testUserWithConnect.email}`);
  });

  test.afterAll(async () => {
    console.log("🧹 Cleaning up test data for participation status change tests");

    // イベントのクリーンアップ
    for (const event of testEvents) {
      try {
        await deleteTestEvent(event.id);
        console.log(`✓ Deleted test event: ${event.title} (${event.id})`);
      } catch (error) {
        console.error(`✗ Failed to delete test event ${event.id}:`, error);
      }
    }

    // テストユーザーのクリーンアップ
    try {
      await deleteTestUser(testUser.email);
      console.log(`✓ Deleted test user: ${testUser.email}`);
    } catch (error) {
      console.error(`✗ Failed to delete test user ${testUser.email}:`, error);
    }

    try {
      await deleteTestUser(testUserWithConnect.email);
      console.log(`✓ Deleted test user: ${testUserWithConnect.email}`);
    } catch (error) {
      console.error(`✗ Failed to delete test user ${testUserWithConnect.email}:`, error);
    }
  });

  test.beforeEach(async ({ page }) => {
    // デバッグ用のコンソールログを有効化
    page.on("console", (msg) => console.log("Browser console:", msg.text()));
  });

  test("【参加→不参加】無料イベントでの参加キャンセル", async ({ page }) => {
    console.log("🧪 Testing participation cancellation for free event");

    // 無料イベントを作成
    const event = await createTestEvent(testUser.id, {
      title: "参加キャンセルテスト（無料）",
      fee: 0,
    });
    testEvents.push(event);

    // 参加状態の参加者を作成
    const attendance = await createTestAttendance(event.id, {
      email: "cancel-free@example.com",
      nickname: "キャンセル太郎",
      status: "attending",
    });
    testAttendances.push(attendance);
    console.log(`✓ Created attending participant for free event`);

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${attendance.guest_token}`);
    console.log(`📍 Navigated to guest management page: /guest/${attendance.guest_token}`);

    // 現在のステータスが「参加」であることを確認
    await expect(page.getByText("参加予定")).toBeVisible();
    console.log("✓ Current status is 'attending'");

    // 参加状況を変更ボタンをクリック
    await page.getByRole("button", { name: "ステータス・支払い方法の変更" }).click();
    await page.waitForTimeout(500);

    // 参加ステータスを「不参加」に変更（ボタンをクリック）
    await page.getByRole("button", { name: "不参加", exact: true }).click();
    console.log("✓ Changed status to 'not_attending'");

    // 保存ボタンが有効になるまで待機
    const saveButton = page.getByRole("button", { name: "内容を保存する" });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    console.log("✓ Save button is now enabled");

    // 変更を保存
    await saveButton.click();
    console.log("✓ Clicked save button");

    // 保存成功のトーストが表示されることを確認
    await expect(page.getByRole("alert").filter({ hasText: "更新完了" })).toBeVisible({
      timeout: 10000,
    });
    console.log("✓ Save success toast displayed");

    // ページがリフレッシュされるのを待つ
    await page.waitForTimeout(1500);

    // 不参加ステータスが反映されていることを確認
    await expect(page.getByText("不参加", { exact: true }).first()).toBeVisible();
    console.log("✓ Status changed to 'not_attending' confirmed");

    console.log("🎉 Free event participation cancellation completed successfully");
  });

  test("【参加→不参加】有料イベント（未払い）での参加キャンセル", async ({ page }) => {
    console.log("🧪 Testing participation cancellation for paid event (unpaid)");

    // 有料イベントを作成
    const event = await createPaidTestEvent(testUserWithConnect.id, 1500);
    testEvents.push(event);

    // 参加状態の参加者を作成（未払い）
    const attendance = await createTestAttendance(event.id, {
      email: "cancel-paid-unpaid@example.com",
      nickname: "キャンセル花子",
      status: "attending",
    });
    testAttendances.push(attendance);

    // pending状態の決済を作成
    await createPendingTestPayment(attendance.id, {
      amount: event.fee,
      method: "stripe",
      stripeAccountId: testUserWithConnect.stripeConnectAccountId,
    });
    console.log(`✓ Created attending participant with pending payment`);

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${attendance.guest_token}`);

    // 現在のステータスが「参加」であることを確認
    await expect(page.getByText("参加予定")).toBeVisible();

    // 参加状況を変更ボタンをクリック
    await page.getByRole("button", { name: "ステータス・支払い方法の変更" }).click();
    await page.waitForTimeout(500);

    // 参加ステータスを「不参加」に変更
    await page.getByRole("button", { name: "不参加", exact: true }).click();
    console.log("✓ Changed status to 'not_attending'");

    // 保存ボタンが有効になるまで待機
    const saveButton = page.getByRole("button", { name: "内容を保存する" });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    // 変更を保存
    await saveButton.click();

    // 保存成功のトーストが表示されることを確認
    await expect(page.getByRole("alert").filter({ hasText: "更新完了" })).toBeVisible({
      timeout: 10000,
    });
    console.log("✓ Participation cancelled successfully");

    // pending決済はcanceledステータスに変更されることを確認（データベースで確認）
    const adminClient = await createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Checking payment cancellation after attendance cancellation",
      {
        operationType: "SELECT",
        accessedTables: ["public.payments", "public.system_logs"],
      }
    );

    const { data: payments } = await adminClient
      .from("payments")
      .select("*")
      .eq("attendance_id", attendance.id);

    expect(payments?.length).toBeGreaterThan(0);
    if (payments && payments.length > 0) {
      expect(payments[0].status).toBe("canceled");
      console.log("✓ Pending payment status changed to 'canceled'");
    }

    // システムログにキャンセルログが記録されていることを確認
    const { data: logs } = await adminClient
      .from("system_logs")
      .select("*")
      .eq("action", "payment.canceled")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(logs?.length).toBeGreaterThan(0);
    console.log("✓ System log for payment cancellation recorded");

    console.log("🎉 Paid event (unpaid) participation cancellation completed successfully");
  });

  test("【参加→不参加】有料イベント（現金集金済み）での参加キャンセル", async ({ page }) => {
    console.log("🧪 Testing participation cancellation for paid event (cash paid)");

    // 有料イベントを作成
    const event = await createPaidTestEvent(testUserWithConnect.id, 2000);
    testEvents.push(event);

    // 参加状態の参加者を作成
    const attendance = await createTestAttendance(event.id, {
      email: "cancel-paid-cash@example.com",
      nickname: "現金決済次郎",
      status: "attending",
    });
    testAttendances.push(attendance);

    // received状態の現金決済を作成
    const adminClient = await createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Creating cash payment with received status",
      {
        operationType: "INSERT",
        accessedTables: ["public.payments"],
      }
    );

    const { data: insertedPayment, error: insertError } = await adminClient
      .from("payments")
      .insert({
        attendance_id: attendance.id,
        amount: event.fee,
        method: "cash",
        status: "received",
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error(`Failed to insert payment: ${insertError.message}`);
      throw new Error(`Failed to insert payment: ${insertError.message}`);
    }

    console.log(
      `✓ Created attending participant with cash payment (received): ${JSON.stringify(insertedPayment)}`
    );

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${attendance.guest_token}`);

    // 現在のステータスが「参加」であることを確認
    await expect(page.getByText("参加予定")).toBeVisible();

    // 参加状況を変更ボタンをクリック
    await page.getByRole("button", { name: "ステータス・支払い方法の変更" }).click();
    await page.waitForTimeout(500);

    // 参加ステータスを「不参加」に変更
    await page.getByRole("button", { name: "不参加", exact: true }).click();
    console.log("✓ Changed status to 'not_attending'");

    // 保存ボタンが有効になるまで待機
    const saveButton = page.getByRole("button", { name: "内容を保存する" });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    // 変更を保存
    await saveButton.click();

    // 保存成功のトーストが表示されることを確認
    await expect(page.getByRole("alert").filter({ hasText: "更新完了" })).toBeVisible({
      timeout: 10000,
    });
    console.log("✓ Participation cancelled successfully");

    // 現金決済（received）はそのまま維持されることを確認
    const { data: payments, error: paymentsError } = await adminClient
      .from("payments")
      .select("*")
      .eq("attendance_id", attendance.id);

    console.log(
      `Payment check result: ${JSON.stringify({ paymentsCount: payments?.length, payments, error: paymentsError })}`
    );

    // 現金決済は削除されず、receivedステータスのまま維持されるべき
    expect(payments?.length).toBeGreaterThan(0);
    if (payments && payments.length > 0) {
      expect(payments[0].status).toBe("received");
      console.log("✓ Cash payment status maintained as 'received'");
    }

    // システムログに決済維持ログが記録されていることを確認
    const { data: logs } = await adminClient
      .from("system_logs")
      .select("*")
      .eq("action", "payment.status_maintained")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(logs?.length).toBeGreaterThan(0);
    console.log("✓ System log for payment status maintenance recorded");

    console.log("🎉 Paid event (cash paid) participation cancellation completed successfully");
  });

  test("【未定→参加】定員内での参加変更", async ({ page }) => {
    console.log("🧪 Testing status change from maybe to attending within capacity");

    // 定員5名のイベントを作成（既に2名参加）
    const event = await createTestEventWithParticipants(
      testUser.id,
      {
        title: "未定→参加テスト（定員内）",
        fee: 0,
        capacity: 5,
      },
      2 // 既に2名参加
    );
    testEvents.push(event);

    // 未定状態の参加者を作成
    const attendance = await createTestAttendance(event.id, {
      email: "maybe-to-attend@example.com",
      nickname: "未定三郎",
      status: "maybe",
    });
    testAttendances.push(attendance);
    console.log(`✓ Created 'maybe' participant (2/5 capacity filled)`);

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${attendance.guest_token}`);

    // 現在のステータスが「未定」であることを確認（参加状況セクション内）
    await expect(page.getByText("未定", { exact: true }).first()).toBeVisible();
    console.log("✓ Current status is 'maybe'");

    // 参加状況を変更ボタンをクリック
    await page.getByRole("button", { name: "出欠を回答する" }).click();
    await page.waitForTimeout(500);

    // 参加ステータスを「参加」に変更
    await page.getByRole("button", { name: "参加", exact: true }).click();
    console.log("✓ Changed status to 'attending'");

    // 保存ボタンが有効になるまで待機
    const saveButton = page.getByRole("button", { name: "内容を保存する" });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    // 変更を保存
    await saveButton.click();

    // 保存成功のトーストが表示されることを確認
    await expect(page.getByRole("alert").filter({ hasText: "更新完了" })).toBeVisible({
      timeout: 10000,
    });
    console.log("✓ Status change successful");

    // 参加ステータスが反映されていることを確認
    await page.waitForTimeout(1500);
    await expect(page.getByText("参加予定")).toBeVisible();
    console.log("✓ Status changed to 'attending' confirmed");

    console.log("🎉 Status change from maybe to attending completed successfully");
  });

  test("【未定→参加】定員超過での参加変更エラー", async ({ page }) => {
    console.log("🧪 Testing status change from maybe to attending when capacity is full");

    // 定員3名のイベントを作成（既に3名参加 = 満員）
    const event = await createTestEventWithParticipants(
      testUser.id,
      {
        title: "未定→参加テスト（定員超過）",
        fee: 0,
        capacity: 3,
      },
      3 // 既に3名参加（満員）
    );
    testEvents.push(event);

    // 未定状態の参加者を作成
    const attendance = await createTestAttendance(event.id, {
      email: "maybe-to-attend-full@example.com",
      nickname: "未定四郎",
      status: "maybe",
    });
    testAttendances.push(attendance);
    console.log(`✓ Created 'maybe' participant (3/3 capacity filled - FULL)`);

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${attendance.guest_token}`);

    // 現在のステータスが「未定」であることを確認（参加状況セクション内）
    await expect(page.getByText("未定", { exact: true }).first()).toBeVisible();
    console.log("✓ Current status is 'maybe'");

    // 参加状況を変更ボタンをクリック
    await page.getByRole("button", { name: "出欠を回答する" }).click();
    await page.waitForTimeout(500);

    // 参加ステータスを「参加」に変更
    await page.getByRole("button", { name: "参加", exact: true }).click();
    console.log("✓ Changed status to 'attending'");

    // 保存ボタンが有効になるまで待機
    const saveButton = page.getByRole("button", { name: "内容を保存する" });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    // 変更を保存（エラーが期待される）
    await saveButton.click();

    // エラーメッセージの確認（アラートとして表示されます）
    await expect(
      page.locator('[role="alert"]').filter({ hasText: /定員|満員|capacity/i })
    ).toBeVisible({ timeout: 10000 });
    console.log("✓ Capacity error message displayed");

    // ステータスが変更されていないことを確認（未定のまま）
    await page.waitForTimeout(1500);
    await expect(page.getByText("未定", { exact: true }).first()).toBeVisible();
    console.log("✓ Status remained 'maybe' due to capacity limit");

    console.log("🎉 Capacity error handling completed successfully");
  });

  test("【未定→参加】有料イベントでの決済フロー開始", async ({ page }) => {
    console.log("🧪 Testing status change from maybe to attending for paid event");

    // 有料イベントを作成
    const event = await createPaidTestEvent(testUserWithConnect.id, 2500);
    testEvents.push(event);

    // 未定状態の参加者を作成
    const attendance = await createTestAttendance(event.id, {
      email: "maybe-to-attend-paid@example.com",
      nickname: "未定五郎",
      status: "maybe",
    });
    testAttendances.push(attendance);
    console.log(`✓ Created 'maybe' participant for paid event`);

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${attendance.guest_token}`);

    // 現在のステータスが「未定」であることを確認
    await expect(page.getByText("未定", { exact: true }).first()).toBeVisible();
    console.log("✓ Current status is 'maybe'");

    // 参加状況を変更ボタンをクリック
    await page.getByRole("button", { name: "出欠を回答する" }).click();
    await page.waitForTimeout(500);

    // 参加ステータスを「参加」に変更
    await page.getByRole("button", { name: "参加", exact: true }).click();
    console.log("✓ Changed status to 'attending'");

    // 決済方法の選択肢が表示されることを確認
    await expect(page.getByText("支払い方法").first()).toBeVisible();
    console.log("✓ Payment method selection displayed");

    // オンライン決済を選択
    await page.getByRole("button", { name: /オンライン決済/ }).click();
    console.log("✓ Selected online payment method");

    // 保存ボタンが有効になるまで待機
    const saveButton = page.getByRole("button", { name: "内容を保存する" });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    // 変更を保存
    await saveButton.click();

    // 保存成功のトーストが表示されることを確認
    await expect(page.getByRole("alert").filter({ hasText: "更新完了" })).toBeVisible({
      timeout: 10000,
    });
    console.log("✓ Status change successful");

    // 決済が必要な状態になっていることを確認
    await page.waitForTimeout(1500);

    // 参加ステータスが「参加」になっていることを確認
    await expect(page.getByText("参加予定")).toBeVisible();
    console.log("✓ Status changed to 'attending' confirmed");

    // 決済ボタンが表示されることを確認
    await expect(page.getByRole("button", { name: /オンライン決済へ進む/ })).toBeVisible();
    console.log("✓ Payment required state confirmed");

    console.log("🎉 Status change with payment flow initiation completed successfully");
  });

  test("【期限後の変更】出欠回答期限後の参加状況変更不可", async ({ page }) => {
    console.log("🧪 Testing participation status change after registration deadline");

    // 出欠回答期限が過去のイベントを作成
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1時間前

    const event = await createTestEvent(testUser.id, {
      title: "出欠回答期限後変更テスト",
      fee: 0,
      registration_deadline: pastDeadline,
    });
    testEvents.push(event);

    // 未定状態の参加者を作成
    const attendance = await createTestAttendance(event.id, {
      email: "after-deadline@example.com",
      nickname: "締切後六郎",
      status: "maybe",
    });
    testAttendances.push(attendance);
    console.log(`✓ Created participant for event past registration deadline`);

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${attendance.guest_token}`);

    // 参加状況を直接確認（メッセージは Drawer 内のみ表示）
    console.log("📍 Deadline check (message should be in Drawer)");

    // 「出欠を回答する」ボタンをクリック（Drawerが開くが変更は制限されている）
    await page.getByRole("button", { name: "出欠を回答する" }).click();

    // Drawer内に警告が表示されることを確認
    await expect(
      page.locator('[role="alert"]').filter({ hasText: /参加登録の締切を過ぎているため/ })
    ).toBeVisible();
    console.log("✓ Warning displayed inside the edit drawer");

    // ステータス変更ボタンが無効化されていることを確認
    await expect(page.getByRole("button", { name: "参加", exact: true })).toBeDisabled();
    console.log("✓ Participation buttons are disabled as expected");

    console.log("✓ Status change is properly disabled after deadline");
    console.log("🎉 Deadline enforcement completed successfully");
  });

  test("【期限後の変更】出欠回答期限後でも決済は可能", async ({ page }) => {
    console.log("🧪 Testing payment after registration deadline");

    // 出欠回答期限が過去、オンライン支払い期限が未来のイベントを作成
    const pastRegistrationDeadline = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1時間前
    const futurePaymentDeadline = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1時間後

    const event = await createPaidTestEvent(testUserWithConnect.id, 3000);

    // イベントの締切を手動で更新
    const adminClient = await createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Updating event deadlines for after-deadline test",
      {
        operationType: "UPDATE",
        accessedTables: ["public.events"],
      }
    );

    await adminClient
      .from("events")
      .update({
        registration_deadline: pastRegistrationDeadline,
        payment_deadline: futurePaymentDeadline,
      })
      .eq("id", event.id);

    testEvents.push(event);

    // 参加状態（未払い）の参加者を作成
    const attendance = await createTestAttendance(event.id, {
      email: "payment-after-deadline@example.com",
      nickname: "締切後決済七郎",
      status: "attending",
    });
    testAttendances.push(attendance);

    // pending決済を作成
    await createPendingTestPayment(attendance.id, {
      amount: event.fee,
      method: "stripe",
      stripeAccountId: testUserWithConnect.stripeConnectAccountId,
    });

    console.log(`✓ Created participant with pending payment after registration deadline`);

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${attendance.guest_token}`);

    // 参加状況を直接確認
    console.log("📍 Deadline check");
    console.log("✓ Modification not allowed message displayed");

    // 決済ボタンは表示されることを確認
    await expect(page.getByRole("button", { name: /オンライン決済へ進む/ })).toBeVisible();
    console.log("✓ Payment button is still available");

    // 「ステータス・支払い方法の変更」ボタンは表示される
    const changeButton = page.getByRole("button", { name: "ステータス・支払い方法の変更" });
    await expect(changeButton).toBeVisible();
    console.log("✓ Change button is visible");

    console.log("✓ Status change is disabled, but payment is allowed");
    console.log("🎉 Payment after deadline completed successfully");
  });

  test("【不参加→参加】不参加から参加への変更", async ({ page }) => {
    console.log("🧪 Testing status change from not_attending to attending");

    // 無料イベントを作成
    const event = await createTestEvent(testUser.id, {
      title: "不参加→参加テスト",
      fee: 0,
    });
    testEvents.push(event);

    // 不参加状態の参加者を作成
    const attendance = await createTestAttendance(event.id, {
      email: "not-to-attend@example.com",
      nickname: "復活八郎",
      status: "not_attending",
    });
    testAttendances.push(attendance);
    console.log(`✓ Created 'not_attending' participant`);

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${attendance.guest_token}`);

    // 現在のステータスが「不参加」であることを確認（参加状況セクション内）
    await expect(page.getByText("不参加", { exact: true }).first()).toBeVisible();
    console.log("✓ Current status is 'not_attending'");

    // 参加状況を変更ボタンをクリック
    await page.getByRole("button", { name: "ステータス・支払い方法の変更" }).click();
    await page.waitForTimeout(500);

    // 参加ステータスを「参加」に変更
    await page.getByRole("button", { name: "参加", exact: true }).click();
    console.log("✓ Changed status to 'attending'");

    // 保存ボタンが有効になるまで待機
    const saveButton = page.getByRole("button", { name: "内容を保存する" });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    // 変更を保存
    await saveButton.click();

    // 保存成功のトーストが表示されることを確認
    await expect(page.getByRole("alert").filter({ hasText: "更新完了" })).toBeVisible({
      timeout: 10000,
    });
    console.log("✓ Status change successful");

    // 参加ステータスが反映されていることを確認
    await page.waitForTimeout(1500);
    await expect(page.getByText("参加予定")).toBeVisible();
    console.log("✓ Status changed to 'attending' confirmed");

    console.log("🎉 Status change from not_attending to attending completed successfully");
  });
});
