/**
 * 現金決済フロー E2Eテスト
 *
 * flow.md の「4-2. 現金決済」に対応
 * 仕様書: docs/spec/test/e2e/cash.md
 *
 * テストケース:
 * - ケース1: 現金選択 - pending状態での決済レコード作成
 * - ケース2: 受領確認 - 運営者による手動ステータス更新
 * - ケース3: 免除処理 - 特別事情での決済免除機能
 *
 * 前提条件:
 * - .env.test に SKIP_QSTASH_IN_TEST=true が設定されていること
 * - ローカルのSupabaseが起動していること
 * - 認証済みセットアップが完了していること（auth.setup.ts）
 *
 * 注意:
 * - Stripe CLIは不要（現金決済のテストのため）
 * - DB操作はSupabase Service Role Keyを使用
 *
 * 参考:
 * - flow.md: 4-2. 現金決済
 * - docs/spec/test/e2e/cash.md: P0（必須）基本フロー
 */

import { test, expect } from "@playwright/test";

import { getPaymentFromDB } from "../../helpers/payment-helpers";
import { TestDataManager, TEST_IDS } from "../../helpers/test-data-setup";

test.describe("現金決済フロー (CASH-PAYMENT-E2E-001)", () => {
  // 各テスト後のクリーンアップ
  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("ケース1: 現金選択 - pending状態での決済レコード作成", async ({ page }) => {
    /**
     * テストID: CASH-PAYMENT-E2E-001-1
     * 優先度: P0
     * カバー率寄与: 33%
     *
     * 前提条件:
     * - 有料イベントが作成されている
     * - 決済方法に「現金」が含まれている
     *
     * 期待結果:
     * - ゲストが参加登録時に現金決済を選択できる
     * - 決済レコードが status='pending', method='cash' で作成される
     * - 参加者の status='attending' が設定される
     * - ゲスト管理ページで決済ステータスが「支払い待ち」と表示される
     */

    console.log("=== ケース1: 現金選択 - pending状態での決済レコード作成 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();

    // 現金決済を含む有料イベントを作成
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // イベントを作成（payment_methodsに"cash"を含める）
    await TestDataManager.createPaidEvent();

    // payment_methodsに"cash"を追加
    const { error: updateError } = await supabase
      .from("events")
      .update({
        payment_methods: ["stripe", "cash"],
        updated_at: new Date().toISOString(),
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (updateError) {
      throw new Error(`Failed to update event payment methods: ${updateError.message}`);
    }

    // イベント情報を取得（招待トークンを確認）
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("invite_token")
      .eq("id", TEST_IDS.EVENT_ID)
      .single();

    if (eventError || !eventData) {
      throw new Error("Failed to fetch event data");
    }

    console.log("✓ テストデータ作成完了");

    // === 2. 招待リンクから参加登録 ===
    const inviteUrl = `http://localhost:3000/invite/${eventData.invite_token}`;
    await page.goto(inviteUrl);
    await page.waitForLoadState("networkidle");

    console.log("✓ 招待ページに遷移");

    // イベント情報が表示されることを確認
    await expect(page.getByText("E2Eテスト有料イベント")).toBeVisible();

    // 参加登録ボタンをクリック
    await page.getByRole("button", { name: "参加申し込みをする" }).click();

    // フォームが表示されるのを待機
    await expect(page.getByLabel("ニックネーム")).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toBeVisible();

    console.log("✓ 参加登録フォームが表示された");

    // === 3. フォームに入力 ===
    await page.getByLabel("ニックネーム").fill("現金太郎");
    await page.getByLabel("メールアドレス").fill("cash-participant@example.com");

    // 参加ステータスを「参加」に設定
    await page.locator('[role="radio"][value="attending"]').check();
    await expect(page.locator('[role="radio"][value="attending"]')).toBeChecked();

    console.log("✓ 基本情報を入力");

    // === 4. 決済方法として「現金」を選択 ===
    // 決済方法の選択肢が表示されることを確認
    await expect(page.getByText("決済方法", { exact: true }).first()).toBeVisible();

    // 現金決済オプションを選択
    const cashPaymentOption = page.getByRole("radio", { name: /現金決済.*直接現金でお支払い/ });
    await expect(cashPaymentOption).toBeVisible();
    await cashPaymentOption.check();
    await expect(cashPaymentOption).toBeChecked();

    console.log("✓ 決済方法「現金」を選択");

    // フォームの状態更新を待つ
    await page.waitForTimeout(500);

    // === 5. 参加登録を送信 ===
    const submitButton = page.getByRole("button", { name: "参加申し込みを完了する" });
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    console.log("✓ 参加登録を送信");

    // === 6. 登録完了画面の確認 ===
    await expect(page.getByText("参加申し込みが完了しました")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("現金太郎")).toBeVisible();

    console.log("✓ 登録完了画面が表示された");

    // === 7. DBで決済レコードの確認 ===
    // 参加者IDを取得
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("attendances")
      .select("id, status")
      .eq("event_id", TEST_IDS.EVENT_ID)
      .eq("email", "cash-participant@example.com")
      .single();

    if (attendanceError || !attendanceData) {
      throw new Error("Failed to fetch attendance data");
    }

    console.log("✓ 参加者データを取得:", attendanceData);

    // 参加者のステータスを確認
    expect(attendanceData.status).toBe("attending");

    // 決済レコードを取得
    const payment = await getPaymentFromDB(attendanceData.id);

    // 決済レコードの内容を確認
    expect(payment.method).toBe("cash");
    expect(payment.status).toBe("pending");
    expect(payment.amount).toBe(3000);
    expect(payment.paid_at).toBeNull();

    console.log("✓ 決済レコードが正しく作成されている:", {
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
    });

    // === 8. ゲスト管理ページで決済ステータスを確認 ===
    const { data: guestData, error: guestError } = await supabase
      .from("attendances")
      .select("guest_token")
      .eq("id", attendanceData.id)
      .single();

    if (guestError || !guestData) {
      throw new Error("Failed to fetch guest token");
    }

    const guestPageUrl = `http://localhost:3000/guest/${guestData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle", { timeout: 60000 });

    console.log("✓ ゲスト管理ページに遷移");

    // 決済ステータスが「支払い待ち」と表示されることを確認
    await expect(page.getByText(/未決済/i)).toBeVisible();

    console.log("✓ ゲスト管理ページで決済ステータスが表示された");

    console.log("🎉 ケース1: テスト成功（現金選択 - pending状態での決済レコード作成）");
  });

  test("ケース2: 受領確認 - 運営者による手動ステータス更新", async ({ page }) => {
    /**
     * テストID: CASH-PAYMENT-E2E-001-2
     * 優先度: P0
     * カバー率寄与: 33%
     *
     * 前提条件:
     * - 現金決済pending状態の参加者が存在する
     * - 主催者として認証済み
     *
     * 期待結果:
     * - 参加者管理ページで「受領」ボタンが表示される
     * - ボタンクリックで決済ステータスが 'received' に更新される
     * - paid_at が設定される
     * - 成功トーストが表示される
     * - UIで受領済みバッジが表示される
     */

    console.log("=== ケース2: 受領確認 - 運営者による手動ステータス更新 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // payment_methodsに"cash"を追加
    const { error: updateError } = await supabase
      .from("events")
      .update({
        payment_methods: ["stripe", "cash"],
        updated_at: new Date().toISOString(),
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (updateError) {
      throw new Error(`Failed to update event payment methods: ${updateError.message}`);
    }

    // 参加者を作成
    const _attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });

    // 現金決済レコードを手動で作成（pending状態）
    const paymentId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: paymentError } = await supabase.from("payments").insert({
      id: paymentId,
      attendance_id: TEST_IDS.ATTENDANCE_ID,
      amount: 3000,
      status: "pending",
      method: "cash",
      created_at: now,
      updated_at: now,
      paid_at: null,
    });

    if (paymentError) {
      throw new Error(`Failed to create cash payment: ${paymentError.message}`);
    }

    console.log("✓ テストデータ作成完了（現金決済pending状態）");

    // === 2. テストユーザーでログイン ===
    console.log("🔐 テストユーザーでログイン中...");

    // まずログアウト処理（既存のセッションをクリア）
    console.log("🚪 既存セッションをクリア中...");

    // ダッシュボードにアクセスしてユーザーメニューからログアウト
    await page.goto("http://localhost:3000/dashboard");
    await page.waitForLoadState("networkidle");

    // ユーザーメニューを開く
    const userMenuButton = page.getByRole("button", { name: "ユーザーメニューを開く" });
    await userMenuButton.click();

    // ログアウトボタンをクリック
    const logoutButton = page.getByRole("menuitem", { name: "ログアウト" });
    await logoutButton.click();

    // ログアウト完了を待機（ログインページにリダイレクトされる）
    await page.waitForURL("**/login", { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // ログインページにアクセス
    await page.goto("http://localhost:3000/login");
    await page.waitForLoadState("networkidle");

    // ログインフォームに認証情報を入力
    await page.fill('input[name="email"]', "test-e2e@example.com");
    await page.fill('input[name="password"]', "test-password-123");

    // ログインボタンをクリック
    await page.click('button[type="submit"]');

    // ログイン完了を待機（ダッシュボードにリダイレクトされる）
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    console.log("✓ テストユーザーでログイン完了");

    // === 3. 参加者管理ページにアクセス ===
    const participantsPageUrl = `http://localhost:3000/events/${TEST_IDS.EVENT_ID}/participants`;
    await page.goto(participantsPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ 参加者管理ページに遷移");

    // === 4. 参加者情報が表示されることを確認 ===
    await expect(page.getByText("E2Eテスト参加者")).toBeVisible({ timeout: 10000 });

    console.log("✓ 参加者情報が表示された");

    // === 5. 「受領」ボタンを探してクリック ===
    // 受領ボタンは title="受領済みにする" で識別
    const receiveButton = page.getByRole("button", { name: "受領済みにする" }).first();
    await expect(receiveButton).toBeVisible();

    console.log("✓ 「受領」ボタンが表示された");

    // ボタンをクリック
    await receiveButton.click();

    // === 6. 成功トーストの確認 ===
    // トースト表示を待機（タイムアウトを長めに設定）
    await expect(page.getByText(/決済状況を更新しました|更新しました/i)).toBeVisible({
      timeout: 5000,
    });

    console.log("✓ 成功トーストが表示された");

    // === 7. DBで決済ステータスの確認 ===
    await page.waitForTimeout(1000); // DB更新を待機

    const payment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);

    expect(payment.status).toBe("received");
    expect(payment.paid_at).not.toBeNull();
    expect(payment.method).toBe("cash");

    console.log("✓ DBで決済ステータスが 'received' に更新された:", {
      status: payment.status,
      paid_at: payment.paid_at,
    });

    // === 8. ページリフレッシュ後もステータスが維持されることを確認 ===
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // 受領済みバッジまたは表示が確認できること
    // 「受領」ボタンが非表示になっていること（受領済みのため）
    await expect(page.getByText("E2Eテスト参加者")).toBeVisible();

    // 受領済みの場合、「取消」ボタンが表示される
    const cancelButton = page.getByRole("button", { name: "受領を取り消し" }).first();
    await expect(cancelButton).toBeVisible();

    console.log("✓ ページリフレッシュ後もステータスが維持されている");

    console.log("🎉 ケース2: テスト成功（受領確認 - 運営者による手動ステータス更新）");
  });

  test("ケース3: 免除処理 - 特別事情での決済免除機能", async ({ page }) => {
    /**
     * テストID: CASH-PAYMENT-E2E-001-3
     * 優先度: P0
     * カバー率寄与: 33%
     *
     * 前提条件:
     * - 現金決済pending状態の参加者が存在する
     * - 主催者として認証済み
     *
     * 期待結果:
     * - 参加者管理ページで「免除」ボタンが表示される
     * - ボタンクリックで決済ステータスが 'waived' に更新される
     * - paid_at は変更されない（NULLのまま）
     * - 成功トーストが表示される
     * - UIで免除済みバッジが表示される
     */

    console.log("=== ケース3: 免除処理 - 特別事情での決済免除機能 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // payment_methodsに"cash"を追加
    const { error: updateError } = await supabase
      .from("events")
      .update({
        payment_methods: ["stripe", "cash"],
        updated_at: new Date().toISOString(),
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (updateError) {
      throw new Error(`Failed to update event payment methods: ${updateError.message}`);
    }

    // 参加者を作成
    const _attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });

    // 現金決済レコードを手動で作成（pending状態）
    const paymentId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: paymentError } = await supabase.from("payments").insert({
      id: paymentId,
      attendance_id: TEST_IDS.ATTENDANCE_ID,
      amount: 3000,
      status: "pending",
      method: "cash",
      created_at: now,
      updated_at: now,
      paid_at: null,
    });

    if (paymentError) {
      throw new Error(`Failed to create cash payment: ${paymentError.message}`);
    }

    console.log("✓ テストデータ作成完了（現金決済pending状態）");

    // === 2. テストユーザーでログイン ===
    console.log("🔐 テストユーザーでログイン中...");

    // まずログアウト処理（既存のセッションをクリア）
    console.log("🚪 既存セッションをクリア中...");

    // ダッシュボードにアクセスしてユーザーメニューからログアウト
    await page.goto("http://localhost:3000/dashboard");
    await page.waitForLoadState("networkidle");

    // ユーザーメニューを開く
    const userMenuButton = page.getByRole("button", { name: "ユーザーメニューを開く" });
    await userMenuButton.click();

    // ログアウトボタンをクリック
    const logoutButton = page.getByRole("menuitem", { name: "ログアウト" });
    await logoutButton.click();

    // ログアウト完了を待機（ログインページにリダイレクトされる）
    await page.waitForURL("**/login", { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // ログインページにアクセス
    await page.goto("http://localhost:3000/login");
    await page.waitForLoadState("networkidle");

    // ログインフォームに認証情報を入力
    await page.fill('input[name="email"]', "test-e2e@example.com");
    await page.fill('input[name="password"]', "test-password-123");

    // ログインボタンをクリック
    await page.click('button[type="submit"]');

    // ログイン完了を待機（ダッシュボードにリダイレクトされる）
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    console.log("✓ テストユーザーでログイン完了");

    // === 3. 参加者管理ページにアクセス ===
    const participantsPageUrl = `http://localhost:3000/events/${TEST_IDS.EVENT_ID}/participants`;
    await page.goto(participantsPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ 参加者管理ページに遷移");

    // === 4. 参加者情報が表示されることを確認 ===
    await expect(page.getByText("E2Eテスト参加者")).toBeVisible({ timeout: 10000 });

    console.log("✓ 参加者情報が表示された");

    // === 5. 「免除」ボタンを探してクリック ===
    // 免除ボタンは title="支払いを免除" で識別
    const waiveButton = page.getByRole("button", { name: "支払いを免除" }).first();
    await expect(waiveButton).toBeVisible();

    console.log("✓ 「免除」ボタンが表示された");

    // ボタンをクリック
    await waiveButton.click();

    // === 6. 成功トーストの確認 ===
    // トースト表示を待機（タイムアウトを長めに設定）
    await expect(page.getByText(/決済状況を更新しました|更新しました/i)).toBeVisible({
      timeout: 5000,
    });

    console.log("✓ 成功トーストが表示された");

    // === 7. DBで決済ステータスの確認 ===
    await page.waitForTimeout(1000); // DB更新を待機

    const payment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);

    expect(payment.status).toBe("waived");
    expect(payment.paid_at).toBeNull(); // 免除時は paid_at は変更されない
    expect(payment.method).toBe("cash");

    console.log("✓ DBで決済ステータスが 'waived' に更新された:", {
      status: payment.status,
      paid_at: payment.paid_at,
    });

    // === 8. ページリフレッシュ後もステータスが維持されることを確認 ===
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // 免除済みバッジまたは表示が確認できること
    // 「免除」ボタンが非表示になっていること（免除済みのため）
    await expect(page.getByText("E2Eテスト参加者")).toBeVisible();

    // 免除済みの場合、「取消」ボタンが表示される
    const cancelButton = page.getByRole("button", { name: "受領を取り消し" }).first();
    await expect(cancelButton).toBeVisible();

    console.log("✓ ページリフレッシュ後もステータスが維持されている");

    console.log("🎉 ケース3: テスト成功（免除処理 - 特別事情での決済免除機能）");
  });
});
