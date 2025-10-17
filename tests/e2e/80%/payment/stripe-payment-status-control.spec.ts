/**
 * Stripe決済 ケース2-2: 決済ステータスによる制御 E2Eテスト
 *
 * 仕様書 docs/spec/test/e2e/stripe.md の「2-2. 決済ステータスによる制御」に対応
 *
 * テストケース:
 * - ケース2-2-1: 決済済み（paid）時の再決済ボタン非表示
 * - ケース2-2-2: 払い戻し済み（refunded）時の再決済可能
 *
 * 前提条件:
 * - .env.test に SKIP_QSTASH_IN_TEST=true が設定されていること
 * - ローカルのSupabaseが起動していること
 *
 * 注意:
 * - Stripe CLIは不要（Webhookをトリガーしないテストのため）
 * - DB操作はSupabase Service Role Keyを使用
 *
 * 参考:
 * - https://docs.stripe.com/automated-testing
 * - Stripe公式ベストプラクティス
 */

import { test, expect } from "@playwright/test";

import { TestDataManager } from "../../helpers/test-data-setup";

test.describe("Stripe決済 ケース2-2: 決済ステータスによる制御 (PAYMENT-E2E-006)", () => {
  // 各テスト後のクリーンアップ
  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("ケース2-2-1: 決済済み（paid）時の再決済ボタン非表示", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-006 (ケース2-2-1)
     * 優先度: P0
     * カバー率寄与: 6%
     *
     * 前提条件:
     * - payment.status = 'paid'
     *
     * 期待結果:
     * - ゲスト管理ページで決済ボタンが非表示
     * - 「決済完了」バッジが表示される
     */

    console.log("=== ケース2-2-1: 決済済み（paid）時の再決済ボタン非表示 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    console.log("✓ ユーザー・Connect・イベント作成完了");

    // === 2. 決済済み状態の参加者を作成 ===
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
      existingPayment: {
        amount: 3000,
        status: "paid",
      },
    });

    console.log("✓ 参加者作成完了（決済済み状態）");

    // === 3. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 4. 決済ボタンが非表示であることを確認 ===
    const paymentButton = page.getByRole("button", { name: /決済を完了する/ });

    // ボタンが存在しないまたは非表示であることを確認
    await expect(paymentButton).not.toBeVisible({ timeout: 3000 });

    console.log("✓ 決済ボタンが非表示であることを確認");

    // === 5. 「決済完了」テキストが表示されることを確認 ===
    // ステータスオーバービューカード内で決済状況を確認
    const paymentStatusText = page.locator('text="決済完了"');
    await expect(paymentStatusText).toBeVisible({ timeout: 5000 });

    console.log("✓ 「決済完了」ステータスが表示されている");

    // === 6. 決済金額が表示されていることを確認 ===
    // 決済状況カード内の金額を確認（複数箇所に表示されるため.first()を使用）
    const amountText = page.locator("text=/¥3,000/").first();
    await expect(amountText).toBeVisible();

    console.log("✓ 決済金額が正しく表示されている");

    console.log("🎉 ケース2-2-1: テスト成功（決済済み時の再決済ボタン非表示）");
  });

  test("ケース2-2-2: 払い戻し済み（refunded）時の再決済可能", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-006 (ケース2-2-2)
     * 優先度: P0
     * カバー率寄与: 6%
     *
     * 前提条件:
     * - payment.status = 'refunded'
     *
     * 期待結果:
     * - 決済ボタンが再度表示される
     * - 新規決済フローが開始できる
     */

    console.log("=== ケース2-2-2: 払い戻し済み（refunded）時の再決済可能 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    console.log("✓ ユーザー・Connect・イベント作成完了");

    // === 2. 払い戻し済み状態の参加者を作成 ===
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
      existingPayment: {
        amount: 3000,
        status: "refunded",
      },
    });

    console.log("✓ 参加者作成完了（払い戻し済み状態）");

    // === 3. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 4. 決済ボタンが表示されることを確認 ===
    const paymentButton = page.getByRole("button", { name: /決済を完了する/ });
    await expect(paymentButton).toBeVisible({ timeout: 5000 });

    console.log("✓ 決済ボタンが表示されている");

    // === 5. ボタンがクリック可能（disabled=false）であることを確認 ===
    await expect(paymentButton).toBeEnabled();

    console.log("✓ 決済ボタンがクリック可能");

    // === 6. 決済ステータス表示が「返金済み」であることを確認 ===
    const refundedStatusText = page.locator('text="返金済み"');
    await expect(refundedStatusText).toBeVisible({ timeout: 5000 });

    console.log("✓ 「返金済み」ステータスが表示されている");

    // === 7. 決済金額が表示されていることを確認 ===
    // 決済状況カード内の金額を確認（複数箇所に表示されるため.first()を使用）
    const amountText = page.locator("text=/¥3,000/").first();
    await expect(amountText).toBeVisible();

    console.log("✓ 決済金額が正しく表示されている");

    // === 8. 決済ボタンをクリックして決済フローが開始できることを確認（オプション） ===
    // 注: 実際のStripe決済フローは別のテストでカバーされているため、
    // ここではボタンのクリック可能性のみを確認し、実際のリダイレクトは検証しない
    console.log("✓ 決済ボタンのクリック可能性を確認済み（決済フローは別テストでカバー）");

    console.log("🎉 ケース2-2-2: テスト成功（払い戻し済み時の再決済可能）");
  });

  test("ケース2-2-3: 受領済み（received）時の再決済ボタン非表示", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-006 (ケース2-2-3)
     * 優先度: P0
     * カバー率寄与: 6%
     *
     * 前提条件:
     * - payment.status = 'received'（現金決済完了）
     *
     * 期待結果:
     * - ゲスト管理ページで決済ボタンが非表示
     * - 「決済完了」バッジが表示される
     */

    console.log("=== ケース2-2-3: 受領済み（received）時の再決済ボタン非表示 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    console.log("✓ ユーザー・Connect・イベント作成完了");

    // === 2. 現金決済受領済み状態の参加者を作成 ===
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
      existingPayment: {
        amount: 3000,
        status: "received",
      },
    });

    console.log("✓ 参加者作成完了（現金決済受領済み状態）");

    // === 3. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 4. 決済ボタンが非表示であることを確認 ===
    const paymentButton = page.getByRole("button", { name: /決済を完了する/ });

    // ボタンが存在しないまたは非表示であることを確認
    await expect(paymentButton).not.toBeVisible({ timeout: 3000 });

    console.log("✓ 決済ボタンが非表示であることを確認");

    // === 5. 「決済完了」テキストが表示されることを確認 ===
    const paymentStatusText = page.locator('text="決済完了"');
    await expect(paymentStatusText).toBeVisible({ timeout: 5000 });

    console.log("✓ 「決済完了」ステータスが表示されている");

    // === 6. 決済金額が表示されていることを確認 ===
    // 決済状況カード内の金額を確認（複数箇所に表示されるため.first()を使用）
    const amountText = page.locator("text=/¥3,000/").first();
    await expect(amountText).toBeVisible();

    console.log("✓ 決済金額が正しく表示されている");

    console.log("🎉 ケース2-2-3: テスト成功（現金決済受領済み時の再決済ボタン非表示）");
  });

  test("ケース2-2-4: 免除済み（waived）時の再決済ボタン非表示", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-006 (ケース2-2-4)
     * 優先度: P0
     * カバー率寄与: 6%
     *
     * 前提条件:
     * - payment.status = 'waived'（決済免除）
     *
     * 期待結果:
     * - ゲスト管理ページで決済ボタンが非表示
     * - 「免除」バッジが表示される
     */

    console.log("=== ケース2-2-4: 免除済み（waived）時の再決済ボタン非表示 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    console.log("✓ ユーザー・Connect・イベント作成完了");

    // === 2. 決済免除状態の参加者を作成 ===
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
      existingPayment: {
        amount: 3000,
        status: "waived",
      },
    });

    console.log("✓ 参加者作成完了（決済免除状態）");

    // === 3. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 4. 決済ボタンが非表示であることを確認 ===
    const paymentButton = page.getByRole("button", { name: /決済を完了する/ });

    // ボタンが存在しないまたは非表示であることを確認
    await expect(paymentButton).not.toBeVisible({ timeout: 3000 });

    console.log("✓ 決済ボタンが非表示であることを確認");

    // === 5. 「免除」テキストが表示されることを確認 ===
    const waivedStatusText = page.locator('text="免除"');
    await expect(waivedStatusText).toBeVisible({ timeout: 5000 });

    console.log("✓ 「免除」ステータスが表示されている");

    console.log("🎉 ケース2-2-4: テスト成功（免除済み時の再決済ボタン非表示）");
  });
});
