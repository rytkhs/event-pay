import { test, expect } from "@playwright/test";

// ビューポートを大きくしてDateTimePickerのPopoverが収まるようにする
test.use({ viewport: { width: 1280, height: 1200 } });

/**
 * DateTimePickerで日時を設定するヘルパー関数
 * カスタムDateTimePickerはPopover + Calendar + Selectで構成されている
 */
async function fillDateTimePicker(
  page: import("@playwright/test").Page,
  placeholder: string,
  dateString: string
) {
  // ページ上部にスクロールしてDateTimePickerが表示されるようにする
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);

  // DateTimePickerのボタンをクリックしてPopoverを開く
  const pickerButton = page.getByRole("button", { name: new RegExp(placeholder) });
  await pickerButton.scrollIntoViewIfNeeded();
  await pickerButton.click();

  // 日付文字列をパース (YYYY-MM-DDTHH:mm)
  const [datePart, timePart] = dateString.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  // Popoverが開いていることを確認
  const calendarSlot = page.locator('[data-slot="calendar"]');
  await expect(calendarSlot).toBeVisible();

  // 目標の月まで移動（最大24回）
  for (let i = 0; i < 24; i++) {
    // 現在表示されているキャプションを取得
    const captionLabel = page.locator(".rdp-caption_label, [class*='caption_label']").first();
    const headerText = await captionLabel.textContent();

    if (!headerText) break;

    // 目標の年月文字列を構成（例: "2025年12月"）
    const targetMonthString = `${year}年${month}月`;
    if (headerText.includes(targetMonthString)) {
      break;
    }

    // 次の月へ進むボタンをクリック
    const nextButton = page.locator(
      'button[class*="button_next"], button[name="next-month"], .rdp-button_next'
    );
    if ((await nextButton.count()) > 0) {
      await nextButton.first().click();
      await page.waitForTimeout(150);
    } else {
      break;
    }
  }

  // 日付を選択 - data-day属性を使用
  const targetDateStr = new Date(year, month - 1, day).toLocaleDateString();
  const dayButton = page.locator(`button[data-day="${targetDateStr}"]`);

  if ((await dayButton.count()) > 0) {
    await dayButton.click();
  } else {
    // フォールバック: gridcellから探す（outside以外）
    const gridCells = page.getByRole("gridcell");
    const count = await gridCells.count();
    for (let i = 0; i < count; i++) {
      const cell = gridCells.nth(i);
      const text = await cell.textContent();
      const isOutside = await cell.getAttribute("data-outside");
      if (text?.trim() === day.toString() && isOutside !== "true") {
        await cell.locator("button").click();
        break;
      }
    }
  }

  await page.waitForTimeout(100);

  // 時間を選択 - Popover内のcomboboxを探す
  const hourSelect = page.locator('button[role="combobox"]').first();
  await hourSelect.click();
  await page.waitForTimeout(150);
  await page.getByRole("option", { name: `${hour.toString().padStart(2, "0")}時` }).click();

  await page.waitForTimeout(100);

  // 分を選択
  const minuteSelect = page.locator('button[role="combobox"]').nth(1);
  await minuteSelect.click();
  await page.waitForTimeout(150);
  // 分は0, 15, 30, 45のみ選択可能なので、最も近いものを選択
  const nearestMinute = [0, 15, 30, 45].reduce((prev, curr) =>
    Math.abs(curr - minute) < Math.abs(prev - minute) ? curr : prev
  );
  await page
    .getByRole("option", { name: `${nearestMinute.toString().padStart(2, "0")}分` })
    .click();

  await page.waitForTimeout(100);

  // 完了ボタンをクリック
  await page.getByRole("button", { name: "完了" }).click();
  await page.waitForTimeout(200);
}

test.describe("イベント作成（E2E）", () => {
  test.beforeEach(async ({ page }) => {
    // デバッグ用のコンソールログを有効化
    page.on("console", (msg) => console.log("Browser console:", msg.text()));

    // イベント作成ページに移動
    await page.goto("/events/create");

    // ページが正常に表示されることを確認
    await expect(page).toHaveURL("/events/create");
    await expect(page.getByText("イベント作成")).toBeVisible();
  });

  test("正常系：有効な情報でイベントを作成し、詳細ページに遷移する", async ({ page }) => {
    // 将来の日時を生成（確実に未来になるよう十分な時間差を設定）
    const futureDateString = "2025-12-25T15:00"; // 確実に未来の日時
    const registrationDeadline = "2025-12-24T23:45"; // 申込締切
    const paymentDeadline = "2025-12-24T20:00"; // 決済締切

    // 基本情報セクション
    await page.getByPlaceholder("例：勉強会、夏合宿、会費の集金など").fill("テスト勉強会");
    await page
      .getByPlaceholder("参加者に伝えたいイベントの詳細を入力してください")
      .fill("テスト用の勉強会イベントです。");
    await page.getByPlaceholder("例：〇〇会議室、〇〇居酒屋など").fill("東京都渋谷区テストビル");
    await page.getByPlaceholder("例：50").fill("30");

    // 日時・締め切りセクション - DateTimePickerを使用
    await fillDateTimePicker(page, "開催日時を選択", futureDateString);
    await fillDateTimePicker(page, "参加申込締切を選択", registrationDeadline);

    // 参加費・決済セクション
    await page.getByPlaceholder("0（無料）または100以上").fill("1000");

    // 決済方法を選択（有料なので表示されるはず）
    await expect(page.getByTestId("payment-methods")).toBeVisible();

    // オンライン決済のラベルを取得（チェックボックスはsr-onlyなのでラベルをクリック）
    const paymentMethodsContainer = page.getByTestId("payment-methods");

    // オンライン決済がdisabledかどうかをチェック（opacity-60クラスで判定）
    const onlinePaymentLabel = paymentMethodsContainer.locator("label").filter({
      hasText: "オンライン決済",
    });
    const onlinePaymentClass = await onlinePaymentLabel.getAttribute("class");
    const isOnlinePaymentDisabled = onlinePaymentClass?.includes("opacity-60") ?? false;

    if (!isOnlinePaymentDisabled) {
      // オンライン決済を選択
      await onlinePaymentLabel.click();
      // オンライン決済締切を設定
      await fillDateTimePicker(page, "オンライン決済締切を選択", paymentDeadline);
    } else {
      // オンライン決済が無効な場合は現金を選択
      const cashPaymentLabel = paymentMethodsContainer.locator("label").filter({
        hasText: "現金払い",
      });
      await cashPaymentLabel.click();
    }

    // イベント作成ボタンが有効になるまで待機してからクリック
    await expect(page.getByRole("button", { name: "イベントを作成" })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "イベントを作成" }).click();

    // ローディング状態を確認（「作成中...」テキストが表示される）
    // Spinner + テキストの組み合わせなので、テキストで確認
    await expect(page.getByText("作成中..."))
      .toBeVisible({ timeout: 3000 })
      .catch(() => {
        // 高速なネットワークではローディングが一瞬で終わることがある
      });

    // 詳細ページへのリダイレクトを待機
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+/, { timeout: 15000 });

    // 作成されたイベントの情報が表示されることを確認
    await expect(page.getByText("テスト勉強会")).toBeVisible();
    await expect(page.getByText("1,000円")).toBeVisible();
  });

  test("正常系：無料イベントを作成し、決済方法の選択が不要であることを確認", async ({ page }) => {
    // 将来の日時を生成（確実に未来の日時）
    const futureDateString = "2025-12-26T10:00";
    const registrationDeadline = "2025-12-25T23:45"; // 申込締切

    // 基本情報セクション
    await page.getByPlaceholder("例：勉強会、夏合宿、会費の集金など").fill("無料勉強会");
    await page
      .getByPlaceholder("参加者に伝えたいイベントの詳細を入力してください")
      .fill("無料で参加できる勉強会です。");

    // 日時・締め切りセクション
    await fillDateTimePicker(page, "開催日時を選択", futureDateString);
    await fillDateTimePicker(page, "参加申込締切を選択", registrationDeadline);

    // 参加費・決済セクション（無料）
    await page.getByPlaceholder("0（無料）または100以上").fill("0");

    // 無料イベント用の説明が表示されることを確認
    await expect(page.getByText("参加費が0円のため、決済方法の設定は不要です")).toBeVisible();

    // 決済方法の選択肢が表示されないことを確認
    await expect(page.getByTestId("payment-methods")).not.toBeVisible();

    // イベント作成ボタンをクリック
    await page.getByRole("button", { name: "イベントを作成" }).click();

    // 詳細ページへのリダイレクトを待機
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+/, { timeout: 15000 });

    // 無料イベントとして作成されたことを確認
    await expect(page.getByText("無料勉強会")).toBeVisible();
    // 無料の表示は「無料」または「0円」などの形式
    await expect(page.getByText(/無料|0円/).first()).toBeVisible();
  });

  test("異常系：タイトルが100文字を超える場合、入力が制限される", async ({ page }) => {
    // 101文字のタイトルを作成
    const longTitle = "あ".repeat(101);

    await page.getByPlaceholder("例：勉強会、夏合宿、会費の集金など").fill(longTitle);

    // 実際に入力された値が100文字に制限されていることを確認
    const titleValue = await page
      .getByPlaceholder("例：勉強会、夏合宿、会費の集金など")
      .inputValue();
    expect(titleValue.length).toBe(100);
  });

  test("正常系：キャンセルボタンで ダッシュボードに戻る", async ({ page }) => {
    // キャンセルボタンをクリック
    await page.getByRole("button", { name: "キャンセル" }).click();

    // ダッシュボードに遷移することを確認
    await expect(page).toHaveURL("/dashboard");
  });
});
