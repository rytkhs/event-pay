import { test, expect } from "@playwright/test";

import {
  createTestEvent,
  createFullCapacityTestEvent,
  createTestEventWithParticipants,
  createPaidTestEvent,
  deleteTestEvent,
  type TestEvent,
} from "../helpers/test-event";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/test-user";

test.describe("参加登録（招待リンク）（E2E）", () => {
  let testUser: TestUser;
  const testEvents: TestEvent[] = [];

  test.beforeAll(async () => {
    // テストユーザーを作成
    testUser = await createTestUser("test-invitation@example.com", "testpassword123");
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

  test("正常系：無料イベントに参加登録が成功する", async ({ page }) => {
    // 無料テストイベントを作成
    const event = await createTestEvent(testUser.id, {
      title: "無料テストイベント",
      fee: 0,
      capacity: null,
    });
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // イベント情報が表示されることを確認
    await expect(page.getByText("無料テストイベント")).toBeVisible();
    // 参加費セクション内の「無料」を確認
    await expect(page.locator("text=参加費").locator("..").getByText("無料")).toBeVisible();

    // 参加登録ボタンをクリック
    await expect(page.getByRole("button", { name: "参加申し込みをする" })).toBeVisible();
    await page.getByRole("button", { name: "参加申し込みをする" }).click();

    // 参加登録フォームが表示されることを確認
    await expect(page.getByLabel("ニックネーム")).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toBeVisible();

    // フォームに入力
    await page.getByLabel("ニックネーム").fill("テスト太郎");
    await page.getByLabel("メールアドレス").fill("test-participant@example.com");

    // 参加ステータスを「参加」に設定 - ラベルを使用
    await page.getByText("参加", { exact: true }).click();

    // 選択されたことを確認
    await expect(page.locator("#attending")).toBeChecked();

    // フォームの状態更新を待つ
    await page.waitForTimeout(1000);

    // フォームボタンが有効化されるのを待つ
    await expect(page.getByRole("button", { name: "参加申し込みを完了する" })).toBeEnabled({
      timeout: 5000,
    });

    // 参加登録を送信
    await page.getByRole("button", { name: "参加申し込みを完了する" }).click();

    // 登録成功の確認画面が表示されることを確認
    await expect(page.getByText("参加申し込みが完了しました")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("テスト太郎")).toBeVisible();

    // 管理URLセクションを表示
    await page.getByRole("button", { name: "管理URLを表示" }).click();

    // ゲスト管理URLが表示されることを確認
    await expect(page.getByText(/\/guest\//)).toBeVisible();

    // 無料イベントなので決済は不要であることを確認
    await expect(page.getByText("決済が必要")).not.toBeVisible();
  });

  test("正常系：有料イベントに参加登録すると決済が必要な状態になる", async ({ page }) => {
    // 有料テストイベントを作成
    const event = await createPaidTestEvent(testUser.id, 1500);
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // イベント情報が表示されることを確認
    await expect(page.getByText("有料テストイベント（1500円）")).toBeVisible();
    await expect(page.getByText("1500円")).toBeVisible();

    // 参加登録ボタンをクリック
    await page.getByRole("button", { name: "参加申し込みをする" }).click();

    // フォームに入力
    await page.getByLabel("ニックネーム").fill("有料太郎");
    await page.getByLabel("メールアドレス").fill("paid-participant@example.com");

    // 参加ステータスを「参加」に設定
    await page.locator('[role="radio"][value="attending"]').check();

    // 決済方法の選択肢が表示されることを確認
    await expect(page.getByText("決済方法", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /オンライン決済.*クレジットカード決済/ })
    ).toBeVisible();

    // 決済方法を選択
    await page.getByRole("radio", { name: /オンライン決済.*クレジットカード決済/ }).check();

    // 参加登録を送信
    await page.getByRole("button", { name: "参加申し込みを完了する" }).click();

    // 登録成功の確認画面が表示されることを確認
    await expect(page.getByText("参加申し込みが完了しました")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("有料太郎")).toBeVisible();

    // 決済が必要であることが表示される
    await expect(page.getByText("決済について")).toBeVisible();
  });

  test("異常系：定員に達したイベントで参加登録ができない", async ({ page }) => {
    // 定員2名で満員のテストイベントを作成
    const event = await createFullCapacityTestEvent(testUser.id, 2);
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // イベント情報が表示されることを確認
    await expect(page.getByText("定員満了テストイベント（2名）")).toBeVisible();

    // 定員表示に「満員」が含まれることを確認
    await expect(page.getByText("（満員）")).toBeVisible();

    // 参加登録ボタンが「参加申し込み不可」として無効化されていることを確認
    const registerButton = page.getByRole("button", { name: "参加申し込み不可" });
    await expect(registerButton).toBeVisible();
    await expect(registerButton).toBeDisabled();

    // 定員に達している旨のメッセージが表示されることを確認
    await expect(page.getByText("定員に達しています")).toBeVisible();

    // 参加登録フォームは表示されないことを確認
    await expect(page.getByLabel("ニックネーム")).not.toBeVisible();
  });

  test("異常系：重複したメールアドレスで参加登録がエラーになる", async ({ page }) => {
    // 既に1名参加者がいるテストイベントを作成
    const event = await createTestEventWithParticipants(
      testUser.id,
      {
        title: "重複テスト用イベント",
        fee: 0,
        capacity: null,
      },
      1
    );
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // 参加登録ボタンをクリック
    await page.getByRole("button", { name: "参加申し込みをする" }).click();

    // フォームが表示されるのを確認
    await expect(page.getByLabel("ニックネーム")).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toBeVisible();

    // 既存参加者と同じメールアドレスで登録を試行
    await page.getByLabel("ニックネーム").fill("重複太郎");
    await page.getByLabel("メールアドレス").fill("test-participant-1@example.com"); // 既存参加者と同じメールアドレス
    await page.locator('[role="radio"][value="attending"]').check();

    // フォームボタンが有効化されるのを待つ
    await expect(page.getByRole("button", { name: "参加申し込みを完了する" })).toBeEnabled({
      timeout: 5000,
    });

    // 参加登録を送信
    await page.getByRole("button", { name: "参加申し込みを完了する" }).click();

    // エラー表示領域が表示されるのを待つ（上部のエラーカード）
    await expect(page.getByText("エラー:")).toBeVisible({ timeout: 10000 });

    // 重複エラーメッセージが表示されることを確認
    // エラーは上部のエラー表示領域に表示される
    await expect(
      page.getByText("このメールアドレスは既にこのイベントに登録されています")
    ).toBeVisible();

    // フォームはリセットされずに残る（ユーザーがメールアドレスを修正できるように）
    await expect(page.getByLabel("ニックネーム")).toHaveValue("重複太郎");
    await expect(page.getByLabel("メールアドレス")).toHaveValue("test-participant-1@example.com");
  });

  test("正常系：「未定」ステータスで参加登録できる", async ({ page }) => {
    // 無料テストイベントを作成
    const event = await createTestEvent(testUser.id, {
      title: "未定テストイベント",
      fee: 0,
      capacity: null,
    });
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // 参加登録ボタンをクリック
    await page.getByRole("button", { name: "参加申し込みをする" }).click();

    // フォームに入力
    await page.getByLabel("ニックネーム").fill("未定太郎");
    await page.getByLabel("メールアドレス").fill("maybe-participant@example.com");

    // 参加ステータスを「未定」に設定 - 他のテストと一貫性を保つためvalue-basedセレクタを使用
    await page.locator('[role="radio"][value="maybe"]').check();

    // 参加登録を送信
    await page.getByRole("button", { name: "参加申し込みを完了する" }).click();

    // 登録成功の確認画面が表示されることを確認
    await expect(page.getByText("参加申し込みが完了しました")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("未定太郎")).toBeVisible();

    // 未定なので決済は不要であることを確認
    await expect(page.getByText("決済が必要")).not.toBeVisible();
  });

  test("異常系：無効な招待トークンでアクセスするとエラーページが表示される", async ({ page }) => {
    // 無効な招待トークンでアクセス
    await page.goto("/invite/invalid_token_123456789012345678901234");

    // エラーページが表示されることを確認（最初の要素のみチェック）
    await expect(page.getByText("無効な招待リンク").first()).toBeVisible();

    // 参加登録フォームが表示されないことを確認
    await expect(page.getByLabel("ニックネーム")).not.toBeVisible();
  });

  test("異常系：フォームの必須項目が未入力の場合、バリデーションエラーが表示される", async ({
    page,
  }) => {
    // 無料テストイベントを作成
    const event = await createTestEvent(testUser.id, {
      title: "バリデーションテストイベント",
      fee: 0,
      capacity: null,
    });
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // 参加登録ボタンをクリック
    await page.getByRole("button", { name: "参加申し込みをする" }).click();

    // フォームが表示されることを確認
    await expect(page.getByLabel("ニックネーム")).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toBeVisible();

    // 何も入力せずに送信ボタンをクリック
    await page.getByRole("button", { name: "参加申し込みを完了する" }).click();

    // 各必須項目のバリデーションエラーが表示されることを確認
    await expect(page.getByText("ニックネームは必須です")).toBeVisible();
    await expect(page.getByText("メールアドレスは必須です")).toBeVisible();
    await expect(page.getByText("参加ステータスを選択してください")).toBeVisible();

    // フォームの送信が阻止され、確認画面に進まないことを確認
    await expect(page.getByText("参加申し込みが完了しました")).not.toBeVisible();
  });

  test("異常系：不正なメールアドレス形式の場合、バリデーションエラーが表示される", async ({
    page,
  }) => {
    // 無料テストイベントを作成
    const event = await createTestEvent(testUser.id, {
      title: "メール検証テストイベント",
      fee: 0,
      capacity: null,
    });
    testEvents.push(event);

    // 招待リンクページにアクセス
    await page.goto(`/invite/${event.invite_token}`);

    // 参加登録ボタンをクリック
    await page.getByRole("button", { name: "参加申し込みをする" }).click();

    // 不正なメールアドレス形式で入力
    await page.getByLabel("ニックネーム").fill("不正メール太郎");
    await page.getByLabel("メールアドレス").fill("invalid-email-format"); // 不正な形式
    await page.locator('[role="radio"][value="attending"]').check();

    // 送信ボタンをクリック
    await page.getByRole("button", { name: "参加申し込みを完了する" }).click();

    // メール形式のバリデーションエラーが表示されることを確認
    await expect(
      page
        .getByText("有効なメールアドレスを入力してください")
        .or(page.getByText("メールアドレスの形式が正しくありません"))
    ).toBeVisible();
  });
});
