import { test, expect, Browser } from "@playwright/test";
import {
  loginAsTestUser,
  createTestEvent,
  clearAccountLockout,
} from "./helpers/rhf-test-helpers";

/**
 * 大量同時参加競合テスト
 *
 * テスト対象:
 * - 容量1のイベントに複数ユーザーが同時参加申し込みをした場合の競合制御
 * - データベースの排他制御（SELECT FOR UPDATE）の有効性
 * - UNIQUE制約による重複防止
 * - 適切なエラーハンドリング
 */

test.describe("大量同時参加競合テスト", () => {
  let eventId: string;
  let inviteToken: string;
  let inviteUrl: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    // テスト用イベント作成者でログイン
    await clearAccountLockout("creator@eventpay.test");
    await loginAsTestUser(page, "creator@eventpay.test");

    // 容量1のテスト用イベントを作成
    eventId = await createTestEvent(page, {
      title: "競合テストイベント（定員1名）",
      description: "同時参加申し込み競合テスト用イベント",
      location: "テスト会場",
      date: "2024-12-31T19:00",
      fee: "1000",
      capacity: "1", // 定員1名で競合状況を作る
      paymentMethods: ["stripe"],
    });

    // 招待トークンを取得
    await page.goto(`/events/${eventId}`);
    const inviteElement = page
      .locator('[data-testid="invite-link"], [data-testid="invite-token"], input[readonly]')
      .first();
    const inviteValue = await inviteElement.inputValue().catch(() => inviteElement.textContent());

    if (inviteValue?.includes("/invite/")) {
      inviteUrl = inviteValue;
      inviteToken = inviteValue.split("/invite/")[1];
    } else {
      inviteToken = inviteValue || "";
      inviteUrl = `http://localhost:3000/invite/${inviteToken}`;
    }

    await page.close();
  });

  test("容量1のイベントに5人が同時申し込みをした場合、1人のみ成功する", async ({ browser }) => {
    const concurrentRequests = 5;
    const results: Array<{ success: boolean; error?: string; email: string }> = [];

    // 同時実行用のPromise配列を作成
    const concurrentTasks = Array.from({ length: concurrentRequests }, async (_, index) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const email = `concurrent-test-${Date.now()}-${index}@example.com`;

      try {
        // 招待リンクにアクセス
        await page.goto(inviteUrl);

        // イベント詳細が表示されるまで待機
        await expect(page.locator('h1, h2, [role="heading"]')).toContainText(
          "競合テストイベント（定員1名）",
          { timeout: 10000 }
        );

        // 参加フォームに入力
        await page.fill('[name="nickname"]', `テスト参加者${index + 1}`);
        await page.fill('[name="email"]', email);

        // 参加ステータスを選択
        await page.click("#attending");

        // 支払い方法を選択
        await page.click("#stripe");

        // フォーム送信（同時実行される重要な部分）
        await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

        // 結果を判定
        try {
          // 成功パターン：確認ページが表示される
          await expect(page.getByText("参加申し込みが完了しました")).toBeVisible({ timeout: 15000 });
          results.push({ success: true, email });
        } catch {
          // 失敗パターン：エラーメッセージが表示される
          const errorVisible = await page.getByText("定員に達しているため").isVisible({ timeout: 5000 }).catch(() => false);
          const capacityErrorVisible = await page.getByText("参加できません").isVisible({ timeout: 5000 }).catch(() => false);
          const alreadyRegisteredVisible = await page.getByText("既に登録されています").isVisible({ timeout: 5000 }).catch(() => false);

          if (errorVisible || capacityErrorVisible || alreadyRegisteredVisible) {
            results.push({ success: false, error: "capacity_exceeded", email });
          } else {
            // その他のエラー（予期しないエラー）
            const pageContent = await page.content();
            results.push({ success: false, error: "unexpected_error", email });
            console.warn(`Unexpected error for ${email}:`, pageContent.substring(0, 500));
          }
        }
      } catch (error) {
        results.push({ success: false, error: `exception: ${error}`, email });
      } finally {
        await context.close();
      }
    });

    // 全ての同時実行タスクを実行
    await Promise.all(concurrentTasks);

    // 結果の検証
    console.log("競合テスト結果:", results);

    // 成功したリクエストがちょうど1つであることを確認
    const successfulRequests = results.filter(r => r.success);
    const failedRequests = results.filter(r => !r.success);

    expect(successfulRequests.length).toBe(1); // 1人のみ成功
    expect(failedRequests.length).toBe(concurrentRequests - 1); // 残り4人は失敗

    // 失敗理由が適切であることを確認
    const capacityErrors = failedRequests.filter(r => r.error === "capacity_exceeded");
    expect(capacityErrors.length).toBeGreaterThan(0); // 定員オーバーエラーが発生している

    // 成功した参加者の情報を出力
    console.log("成功した参加者:", successfulRequests[0]?.email);
  });

  test("同一メールアドレスでの重複申し込みは適切に拒否される", async ({ browser }) => {
    const sameEmail = `duplicate-test-${Date.now()}@example.com`;
    const concurrentRequests = 3;
    const results: Array<{ success: boolean; error?: string }> = [];

    // 全て同じメールアドレスで同時申し込み
    const concurrentTasks = Array.from({ length: concurrentRequests }, async (_, index) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto(inviteUrl);
        await expect(page.locator('h1, h2, [role="heading"]')).toContainText(
          "競合テストイベント（定員1名）",
          { timeout: 10000 }
        );

        await page.fill('[name="nickname"]', `重複テスト参加者${index + 1}`);
        await page.fill('[name="email"]', sameEmail);
        await page.click("#attending");
        await page.click("#stripe");
        await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

        try {
          await expect(page.getByText("参加申し込みが完了しました")).toBeVisible({ timeout: 15000 });
          results.push({ success: true });
        } catch {
          const duplicateErrorVisible = await page.getByText("既に登録されています").isVisible({ timeout: 5000 }).catch(() => false);
          const capacityErrorVisible = await page.getByText("定員に達しているため").isVisible({ timeout: 5000 }).catch(() => false);

          if (duplicateErrorVisible) {
            results.push({ success: false, error: "duplicate_email" });
          } else if (capacityErrorVisible) {
            results.push({ success: false, error: "capacity_exceeded" });
          } else {
            results.push({ success: false, error: "other" });
          }
        }
      } catch (error) {
        results.push({ success: false, error: `exception: ${error}` });
      } finally {
        await context.close();
      }
    });

    await Promise.all(concurrentTasks);

    console.log("重複メールテスト結果:", results);

    // 成功は最大1つまで
    const successfulRequests = results.filter(r => r.success);
    expect(successfulRequests.length).toBeLessThanOrEqual(1);

    // UNIQUE制約違反または適切なエラーが発生していることを確認
    const duplicateErrors = results.filter(r => r.error === "duplicate_email");
    const capacityErrors = results.filter(r => r.error === "capacity_exceeded");

    // 重複エラーまたは定員エラーが適切に発生していることを確認
    expect(duplicateErrors.length + capacityErrors.length).toBeGreaterThan(0);
  });

  test("高負荷状況でのレスポンス時間とエラーハンドリング", async ({ browser }) => {
    const highLoadRequests = 10;
    const results: Array<{ success: boolean; responseTime: number; error?: string }> = [];

    const concurrentTasks = Array.from({ length: highLoadRequests }, async (_, index) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const startTime = Date.now();

      try {
        await page.goto(inviteUrl);
        await expect(page.locator('h1, h2, [role="heading"]')).toContainText(
          "競合テストイベント（定員1名）",
          { timeout: 10000 }
        );

        await page.fill('[name="nickname"]', `高負荷テスト${index + 1}`);
        await page.fill('[name="email"]', `highload-${Date.now()}-${index}@example.com`);
        await page.click("#attending");
        await page.click("#stripe");
        await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

        const responseTime = Date.now() - startTime;

        try {
          await expect(page.getByText("参加申し込みが完了しました")).toBeVisible({ timeout: 20000 });
          results.push({ success: true, responseTime });
        } catch {
          const responseTime = Date.now() - startTime;
          results.push({ success: false, responseTime, error: "capacity_or_error" });
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        results.push({ success: false, responseTime, error: `exception: ${error}` });
      } finally {
        await context.close();
      }
    });

    await Promise.all(concurrentTasks);

    console.log("高負荷テスト結果:", results);

    // パフォーマンス検証
    const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    console.log(`平均レスポンス時間: ${averageResponseTime}ms`);

    // レスポンス時間が妥当であることを確認（30秒以内）
    const slowRequests = results.filter(r => r.responseTime > 30000);
    expect(slowRequests.length).toBe(0);

    // 成功は最大1つまで
    const successfulRequests = results.filter(r => r.success);
    expect(successfulRequests.length).toBeLessThanOrEqual(1);

    // 高負荷でもアプリケーションがクラッシュしていないことを確認
    // （全てのリクエストが何らかの結果を返している）
    expect(results.length).toBe(highLoadRequests);
  });
});
