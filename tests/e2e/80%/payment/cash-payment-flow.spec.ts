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

    // フォームが表示されていることを確認
    await expect(page.getByLabel(/ニックネーム/)).toBeVisible();

    // === 3. フォームに入力 ===
    await page.getByLabel(/ニックネーム/).fill("現金太郎");
    await page.getByLabel(/メールアドレス/).fill("cash-participant@example.com");

    // 参加ステータスを「参加」に設定（ボタンクリック）
    await page.getByRole("button", { name: "参加", exact: true }).click();
    // 選択されたことを確認
    await expect(page.getByRole("button", { name: "参加", exact: true })).toHaveClass(
      /bg-primary\/10|border-primary/
    );

    console.log("✓ 基本情報を入力");

    // === 4. 決済方法として「現金」を選択 ===
    // 支払い方法の選択肢が表示されることを確認
    await expect(page.getByText(/支払い方法|決済方法/)).toBeVisible();

    // 現金決済オプションを直接ラジオボタンで選択
    const cashRadio = page.locator('input[type="radio"][value="cash"]');
    await expect(cashRadio).toBeVisible();
    await cashRadio.check({ force: true });
    await expect(cashRadio).toBeChecked();

    console.log("✓ 決済方法「現金」を選択");

    // === 5. 参加登録を送信 ===
    const submitButton = page.getByRole("button", { name: "登録する" });
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    console.log("✓ 参加登録を送信");

    // === 6. 登録完了画面の確認 ===
    // 完了メッセージが表示されるのを待機（タイムアウトを長めに）
    await expect(page.getByText("登録完了")).toBeVisible({ timeout: 20 * 1000 });
    await expect(page.getByText(/ご回答ありがとうございます/)).toBeVisible();

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

    // 参加者のステータスを確認
    expect(attendanceData.status).toBe("attending");

    // 決済レコードを取得
    const payment = await getPaymentFromDB(attendanceData.id);

    // 決済レコードの内容を確認
    expect(payment.method).toBe("cash");
    expect(payment.status).toBe("pending");
    expect(payment.amount).toBe(3000);

    console.log("✓ 決済レコードが正しく作成されている");

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
    await page.waitForLoadState("networkidle");

    // 決済ステータスが表示されることを確認
    await expect(page.getByText(/参加予定/i)).toBeVisible();
    await expect(page.getByText(/現金決済|支払い待ち/i)).toBeVisible();

    console.log("✓ ゲスト管理ページで決済ステータスが表示された");

    console.log("🎉 ケース1: テスト成功");
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
    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    await supabase
      .from("events")
      .update({ payment_methods: ["stripe", "cash"] })
      .eq("id", TEST_IDS.EVENT_ID);
    await TestDataManager.createAttendance({ status: "attending" });

    // 現金決済レコードをpendingで作成
    await supabase.from("payments").insert({
      id: crypto.randomUUID(),
      attendance_id: TEST_IDS.ATTENDANCE_ID,
      amount: 3000,
      status: "pending",
      method: "cash",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // === 2. テストユーザーでログイン ===
    console.log("🔐 ログイン中...");

    // セッションをクリア
    await page.context().clearCookies();
    await page.goto("http://localhost:3000/login");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.fill('input[name="email"]', "test-e2e@example.com");
    await page.fill('input[name="password"]', "test-password-123");

    // ログインフォーム内のボタンを確実にクリック
    const loginForm = page.getByTestId("login-form");
    await loginForm.getByRole("button", { name: "ログイン" }).click();

    await page.waitForURL("**/dashboard", { timeout: 20000 });

    // === 3. 参加者管理ページにアクセス ===
    await page.goto(`http://localhost:3000/events/${TEST_IDS.EVENT_ID}`);
    await page.waitForLoadState("networkidle");

    // 参加者タブに切り替え
    const participantsTab = page.getByRole("tab", { name: /参加者/ });
    await participantsTab.click();
    await expect(page.getByText("E2Eテスト参加者")).toBeVisible({ timeout: 10000 });

    // === 4. 「受領」ボタンをクリック ===
    const receiveButton = page.getByRole("button", { name: "受領" }).first();
    await expect(receiveButton).toBeVisible();
    await receiveButton.click();

    // === 5. 成功トーストとDB確認 ===
    await expect(page.getByText(/更新しました|受領しました/i)).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(1000);
    const payment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);
    expect(payment.status).toBe("received");
    expect(payment.paid_at).not.toBeNull();

    // === 6. ページリフレッシュ後もステータスが維持されることを確認 ===
    await page.reload();
    await page.waitForLoadState("networkidle");
    // 受領済みタブなどの表示を確認するか、取消ボタンの存在を確認
    await expect(page.getByRole("button", { name: /受領を取り消し/i }).first()).toBeVisible();

    console.log("🎉 ケース2: テスト成功");
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
     * - 一括アクションバーから「免除」を実行
     * - 決済ステータスが 'waived' に更新される
     * - 成功トーストが表示される
     */

    console.log("=== ケース3: 免除処理 - 特別事情での決済免除機能 ===");

    // === 1. テストデータの作成 ===
    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    await supabase
      .from("events")
      .update({ payment_methods: ["stripe", "cash"] })
      .eq("id", TEST_IDS.EVENT_ID);
    await TestDataManager.createAttendance({ status: "attending" });

    await supabase.from("payments").insert({
      id: crypto.randomUUID(),
      attendance_id: TEST_IDS.ATTENDANCE_ID,
      amount: 3000,
      status: "pending",
      method: "cash",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // === 2. ログイン ===
    await page.context().clearCookies();
    await page.goto("http://localhost:3000/login");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.fill('input[name="email"]', "test-e2e@example.com");
    await page.fill('input[name="password"]', "test-password-123");

    const loginForm = page.getByTestId("login-form");
    await loginForm.getByRole("button", { name: "ログイン" }).click();

    await page.waitForURL("**/dashboard", { timeout: 20000 });

    // === 3. 参加者管理ページ・タブにアクセス ===
    await page.goto(`http://localhost:3000/events/${TEST_IDS.EVENT_ID}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: /参加者/ }).click();
    await expect(page.getByText("E2Eテスト参加者")).toBeVisible();

    // === 4. 選択モードを有効にし、参加者を選択 ===
    const selectModeButton = page.getByTitle(/選択モード/);
    await selectModeButton.click();

    const checkbox = page.getByRole("checkbox", { name: "選択" }).first();
    await checkbox.check();

    // === 5. 一括アクションバーから「免除」をクリック ===
    const waiveButton = page.getByRole("button", { name: /免除/ }).filter({ hasText: /免除/ });
    await expect(waiveButton).toBeVisible();
    await waiveButton.click();

    // === 6. 成功トーストとDB確認 ===
    await expect(page.getByText(/免除|更新しました/i)).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(1000);
    const payment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);
    expect(payment.status).toBe("waived");
    expect(payment.paid_at).toBeNull();

    console.log("🎉 ケース3: テスト成功");
  });
});
