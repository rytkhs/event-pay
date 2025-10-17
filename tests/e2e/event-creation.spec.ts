import { test, expect } from "@playwright/test";

test.describe("イベント作成（E2E）", () => {
  test.beforeEach(async ({ page }) => {
    // デバッグ用のコンソールログを有効化
    page.on("console", (msg) => console.log("Browser console:", msg.text()));

    // イベント作成ページに移動
    await page.goto("/events/create");

    // ページが正常に表示されることを確認
    await expect(page).toHaveURL("/events/create");
    await expect(page.getByText("新しいイベントを作成")).toBeVisible();
  });

  test("正常系：有効な情報でイベントを作成し、詳細ページに遷移する", async ({ page }) => {
    // 将来の日時を生成（確実に未来になるよう十分な時間差を設定）
    const futureDateString = "2025-12-25T15:00"; // 確実に未来の日時
    const registrationDeadline = "2025-12-24T23:59"; // 申込締切
    const paymentDeadline = "2025-12-24T20:00"; // 決済締切

    // Step 1: 基本情報
    await page.getByLabel("タイトル *").fill("テスト勉強会");
    await page.getByLabel("開催日時 *").fill(futureDateString);
    await page.getByLabel("参加費 *").fill("1000");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 2: 受付・決済設定
    await page.getByLabel("参加申込締切 *").fill(registrationDeadline);

    // 決済方法を選択（有料なので表示されるはず）
    await expect(page.getByTestId("payment-methods")).toBeVisible();

    // オンライン決済が利用可能かチェック
    const onlinePaymentCheckbox = page.getByLabel("オンライン決済");
    const isOnlinePaymentEnabled = await onlinePaymentCheckbox.isEnabled();

    if (isOnlinePaymentEnabled) {
      await onlinePaymentCheckbox.click();
      // オンライン決済締切を設定
      await page.getByLabel("オンライン決済締切 *").fill(paymentDeadline);
    } else {
      // オンライン決済が無効な場合は現金を選択
      await page.getByLabel("現金").click();
    }

    // 決済方法選択後のバリデーション完了を待機
    await page.waitForTimeout(500);

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 3: 詳細情報
    await page.getByLabel("開催場所").fill("東京都渋谷区テストビル");
    await page.getByLabel("イベントの説明・詳細").fill("テスト用の勉強会イベントです。");
    await page.getByLabel("定員").fill("30");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 4: 確認・送信
    await expect(page.getByText("内容確認")).toBeVisible();

    // フォームのバリデーション完了を待機
    await page.waitForTimeout(1000);

    // イベント作成ボタンが有効になるまで待機してからクリック
    await expect(page.getByRole("button", { name: "イベントを作成" })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "イベントを作成" }).click();

    // ローディング状態を確認
    await expect(page.getByRole("button", { name: "作成中..." })).toBeVisible();

    // 詳細ページへのリダイレクトを待機
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+/, { timeout: 10000 });

    // 作成されたイベントの情報が表示されることを確認
    await expect(page.getByText("テスト勉強会")).toBeVisible();
    await expect(page.getByText("1000円")).toBeVisible();
  });

  test("正常系：無料イベントを作成し、決済方法の選択が不要であることを確認", async ({ page }) => {
    // 将来の日時を生成（確実に未来の日時）
    const futureDateString = "2025-12-26T10:00";
    const registrationDeadline = "2025-12-25T23:59"; // 申込締切

    // Step 1: 基本情報（無料イベント）
    await page.getByLabel("タイトル *").fill("無料勉強会");
    await page.getByLabel("開催日時 *").fill(futureDateString);
    await page.getByLabel("参加費 *").fill("0");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 2: 受付・決済設定
    await page.getByLabel("参加申込締切 *").fill(registrationDeadline);

    // 無料イベント用の説明が表示されることを確認
    await expect(page.getByText("参加費が0円のため、決済方法の設定は不要です")).toBeVisible();

    // 決済方法の選択肢が表示されないことを確認
    await expect(page.getByTestId("payment-methods")).not.toBeVisible();

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 3: 詳細情報
    await page.getByLabel("イベントの説明・詳細").fill("無料で参加できる勉強会です。");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 4: 確認・送信
    await expect(page.getByText("内容確認")).toBeVisible();

    // イベント作成ボタンをクリック
    await page.getByRole("button", { name: "イベントを作成" }).click();

    // 詳細ページへのリダイレクトを待機
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+/, { timeout: 10000 });

    // 無料イベントとして作成されたことを確認
    await expect(page.getByText("無料勉強会")).toBeVisible();
    await expect(page.getByText("無料")).toBeVisible();
  });

  test("異常系：必須項目が未入力の場合、バリデーションエラーが表示される", async ({ page }) => {
    // Step 1で「次へ進む」ボタンがdisabledであることを確認
    await expect(page.getByRole("button", { name: "次へ進む" })).toBeDisabled();

    // onChangeモードでは入力値の変更が必要なので、各フィールドに何かを入力してから削除してバリデーションを発生させる

    // タイトル欄に文字を入力してから削除
    await page.getByLabel("タイトル *").fill("a");
    await page.getByLabel("タイトル *").fill("");

    // 開催日時欄に有効な日時を入力してから削除
    await page.getByLabel("開催日時 *").fill("2025-12-25T15:00");
    await page.getByLabel("開催日時 *").clear();

    // 参加費欄に文字を入力してから削除
    await page.getByLabel("参加費 *").fill("1");
    await page.getByLabel("参加費 *").fill("");

    // バリデーションエラーメッセージが表示されることを確認
    await expect(page.getByText("タイトルは必須です")).toBeVisible();
    await expect(page.getByText("開催日時は必須です")).toBeVisible();
    await expect(page.getByText("参加費は必須です")).toBeVisible();

    // 「次へ進む」ボタンが引き続きdisabledであることを確認
    await expect(page.getByRole("button", { name: "次へ進む" })).toBeDisabled();
  });

  test("異常系：開催日時が過去の場合、バリデーションエラーが表示される", async ({ page }) => {
    // 過去の日時を設定
    const pastDate = new Date(Date.now() - 60 * 60 * 1000);
    const pastDateString = pastDate.toISOString().slice(0, 16);

    await page.getByLabel("タイトル *").fill("テストイベント");
    await page.getByLabel("開催日時 *").fill(pastDateString);
    await page.getByLabel("参加費 *").fill("1000");

    // タイトル欄をクリックしてフォーカスを移動（バリデーションをトリガー）
    await page.getByLabel("タイトル *").click();

    // エラーメッセージが表示されることを確認
    await expect(page.getByText("開催日時は現在時刻より後である必要があります")).toBeVisible();

    // 「次へ進む」ボタンが無効化されていることを確認
    await expect(page.getByRole("button", { name: "次へ進む" })).toBeDisabled();
  });

  test("異常系：有料イベントで決済方法が未選択の場合、バリデーションエラーが表示される", async ({
    page,
  }) => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    const registrationDeadline = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16);

    // Step 1: 基本情報（有料イベント）
    await page.getByLabel("タイトル *").fill("テストイベント");
    await page.getByLabel("開催日時 *").fill(futureDateString);
    await page.getByLabel("参加費 *").fill("1000");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 2: 受付・決済設定
    await page.getByLabel("参加申込締切 *").fill(registrationDeadline);

    // 決済方法を選択しない状態で、他のフィールドをクリックしてバリデーションをトリガー
    await page.getByLabel("参加申込締切 *").click();

    // エラーメッセージが表示されることを確認
    await expect(page.getByText("有料イベントでは決済方法の選択が必要です")).toBeVisible();

    // 「次へ進む」ボタンが無効化されていることを確認
    await expect(page.getByRole("button", { name: "次へ進む" })).toBeDisabled();
  });

  test("異常系：参加申込締切が開催日時より後の場合、バリデーションエラーが表示される", async ({
    page,
  }) => {
    const eventDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1日後
    const deadlineDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 2日後（イベントより後）

    const eventDateString = eventDate.toISOString().slice(0, 16);
    const deadlineDateString = deadlineDate.toISOString().slice(0, 16);

    // Step 1: 基本情報
    await page.getByLabel("タイトル *").fill("テストイベント");
    await page.getByLabel("開催日時 *").fill(eventDateString);
    await page.getByLabel("参加費 *").fill("0");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 2: 受付・決済設定（申込締切を無効な値に設定）
    await page.getByLabel("参加申込締切 *").fill(deadlineDateString);

    // 他のフィールドをクリックしてバリデーションをトリガー
    await page.getByLabel("参加申込締切 *").blur();

    // エラーメッセージが表示されることを確認
    await expect(page.getByText("参加申込締切は開催日時より前に設定してください")).toBeVisible();

    // 「次へ進む」ボタンが無効化されていることを確認
    await expect(page.getByRole("button", { name: "次へ進む" })).toBeDisabled();
  });

  test("異常系：決済締切が開催日時より後の場合、バリデーションエラーが表示される", async ({
    page,
  }) => {
    const eventDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1日後
    const registrationDeadline = new Date(Date.now() + 20 * 60 * 60 * 1000); // 20時間後
    const paymentDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000); // 2日後（イベントより後）

    const eventDateString = eventDate.toISOString().slice(0, 16);
    const registrationDeadlineString = registrationDeadline.toISOString().slice(0, 16);
    const paymentDeadlineString = paymentDeadline.toISOString().slice(0, 16);

    // Step 1: 基本情報（有料イベント）
    await page.getByLabel("タイトル *").fill("テストイベント");
    await page.getByLabel("開催日時 *").fill(eventDateString);
    await page.getByLabel("参加費 *").fill("1000");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 2: 受付・決済設定
    await page.getByLabel("参加申込締切 *").fill(registrationDeadlineString);

    // オンライン決済を選択
    await page.getByText("オンライン決済").click();

    // 無効な決済締切を設定
    await page.getByLabel("オンライン決済締切 *").fill(paymentDeadlineString);

    // 他のフィールドをクリックしてバリデーションをトリガー
    await page.getByLabel("オンライン決済締切 *").blur();

    // エラーメッセージが表示されることを確認
    await expect(
      page.getByText("オンライン決済締切は開催日時より前に設定してください")
    ).toBeVisible();

    // 「次へ進む」ボタンが無効化されていることを確認
    await expect(page.getByRole("button", { name: "次へ進む" })).toBeDisabled();
  });

  test("異常系：決済締切が参加申込締切より前の場合、バリデーションエラーが表示される", async ({
    page,
  }) => {
    const eventDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 2日後
    const registrationDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1日後
    const paymentDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12時間後（申込締切より前）

    const eventDateString = eventDate.toISOString().slice(0, 16);
    const registrationDeadlineString = registrationDeadline.toISOString().slice(0, 16);
    const paymentDeadlineString = paymentDeadline.toISOString().slice(0, 16);

    // Step 1: 基本情報（有料イベント）
    await page.getByLabel("タイトル *").fill("テストイベント");
    await page.getByLabel("開催日時 *").fill(eventDateString);
    await page.getByLabel("参加費 *").fill("1000");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 2: 受付・決済設定
    await page.getByLabel("参加申込締切 *").fill(registrationDeadlineString);

    // オンライン決済を選択
    await page.getByText("オンライン決済").click();

    // 無効な決済締切を設定（申込締切より前）
    await page.getByLabel("オンライン決済締切 *").fill(paymentDeadlineString);

    // 他のフィールドをクリックしてバリデーションをトリガー
    await page.getByLabel("オンライン決済締切 *").blur();

    // エラーメッセージが表示されることを確認
    await expect(page.getByText("決済締切は参加申込締切以降に設定してください")).toBeVisible();

    // 「次へ進む」ボタンが無効化されていることを確認
    await expect(page.getByRole("button", { name: "次へ進む" })).toBeDisabled();
  });

  test("異常系：タイトルが100文字を超える場合、入力が制限される", async ({ page }) => {
    // 101文字のタイトルを作成
    const longTitle = "あ".repeat(101);

    await page.getByLabel("タイトル *").fill(longTitle);

    // 実際に入力された値が100文字に制限されていることを確認
    const titleValue = await page.getByLabel("タイトル *").inputValue();
    expect(titleValue.length).toBe(100);
  });

  test("異常系：定員に無効な値を入力した場合、バリデーションエラーが表示される", async ({
    page,
  }) => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    const registrationDeadline = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16);

    // Step 1: 基本情報
    await page.getByLabel("タイトル *").fill("テストイベント");
    await page.getByLabel("開催日時 *").fill(futureDateString);
    await page.getByLabel("参加費 *").fill("0");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 2: 受付・決済設定
    await page.getByLabel("参加申込締切 *").fill(registrationDeadline);

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 3: 詳細情報で定員に無効な値を入力
    await page.getByLabel("定員").fill("10001"); // 上限を超える

    // 他のフィールドをクリックしてバリデーションをトリガー
    await page.getByLabel("イベントの説明・詳細").click();

    // エラーメッセージが表示されることを確認
    await expect(page.getByText("定員は1以上10000以下である必要があります")).toBeVisible();

    // 「次へ進む」ボタンが無効化されていることを確認
    await expect(page.getByRole("button", { name: "次へ進む" })).toBeDisabled();
  });

  test("正常系：リセットボタンで フォームがクリアされる", async ({ page }) => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    const registrationDeadline = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16);

    // Step 1: 基本情報
    await page.getByLabel("タイトル *").fill("テストイベント");
    await page.getByLabel("開催日時 *").fill(futureDateString);
    await page.getByLabel("参加費 *").fill("1000");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 2: 受付・決済設定
    await page.getByLabel("参加申込締切 *").fill(registrationDeadline);
    await page.getByText("現金").click(); // 現金決済を選択

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 3: 詳細情報
    await page.getByLabel("開催場所").fill("テスト会場");
    await page.getByLabel("イベントの説明・詳細").fill("テスト説明");
    await page.getByLabel("定員").fill("30");

    // 次のステップへ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // Step 4: 確認・送信でリセットボタンをクリック
    await page.getByRole("button", { name: "リセット" }).click();

    // フォームがクリアされて Step 1 に戻ることを確認
    await expect(page.getByLabel("タイトル *")).toHaveValue("");
    await expect(page.getByLabel("開催日時 *")).toHaveValue("");
    await expect(page.getByLabel("参加費 *")).toHaveValue("");
  });
});
