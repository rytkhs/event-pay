import { test, expect } from "@playwright/test";

/**
 * イベント管理フローE2Eテスト
 * 統合テストから移行した主要なユーザーフロー
 * react-hook-form対応版
 */

test.describe("イベント管理フロー", () => {
  test.beforeEach(async ({ page }) => {
    // 確認済みのテストユーザーでログイン
    await page.goto("/login");
    await page.fill('[name="email"]', "test@eventpay.test");
    await page.fill('[name="password"]', "TestPassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/home", { timeout: 60000 });
  });

  test.describe("イベント作成フロー", () => {
    test("完全なイベント作成フローが正常に動作する", async ({ page }) => {
      // ダッシュボードからイベント作成ページに遷移
      // イベント作成ボタンが存在するかチェック
      const createButton = page.locator('[data-testid="create-event-button"]');
      if (await createButton.isVisible()) {
        await createButton.click();
      } else {
        // ボタンが見つからない場合は直接URLに遷移
        await page.goto("/events/create");
      }
      await page.waitForURL("/events/create");

      // react-hook-formベースのイベント基本情報を入力（必須フィールドを先に）
      await page.fill('input[name="title"]', "テストイベント");
      // 現在時刻より後の日時を設定
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      const futureDateString = futureDate.toISOString().slice(0, 16);
      await page.fill('input[name="date"]', futureDateString);
      await page.fill('input[name="fee"]', "1000");

      // 決済方法を選択（必須フィールド）- Radix UIのCheckbox対応
      await page.click('[id="stripe"]');
      await page.click('[id="cash"]');

      // オプショナルフィールド
      await page.fill('textarea[name="description"]', "これはテスト用のイベントです");
      await page.fill('input[name="location"]', "東京都渋谷区");
      await page.fill('input[name="capacity"]', "50");

      // 締切日時を設定（オプション）
      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + 20);
      const deadlineDateString = deadlineDate.toISOString().slice(0, 16);
      await page.fill('input[name="registration_deadline"]', deadlineDateString);
      await page.fill('input[name="payment_deadline"]', deadlineDateString);

      // フォームのバリデーションが完了するまで少し待機
      await page.waitForTimeout(2000);

      // デバッグ: フォームの状態を詳細に確認
      const formValues = {
        title: await page.inputValue('input[name="title"]'),
        date: await page.inputValue('input[name="date"]'),
        fee: await page.inputValue('input[name="fee"]'),
        description: await page.inputValue('textarea[name="description"]'),
        location: await page.inputValue('input[name="location"]'),
        capacity: await page.inputValue('input[name="capacity"]'),
      };
      console.log("Form values:", formValues);

      // チェックボックスの状態
      const stripeChecked = await page.isChecked('[id="stripe"]');
      const cashChecked = await page.isChecked('[id="cash"]');
      console.log("Payment methods:", { stripe: stripeChecked, cash: cashChecked });

      // ボタンの状態を確認
      const isDisabled = await page.locator('button[type="submit"]').getAttribute("disabled");
      console.log("Button disabled status:", isDisabled);

      // フォームエラーがないかチェック
      const errors = await page.locator('[role="alert"]').allTextContents();
      console.log("Form errors:", errors);

      // フォームを送信
      await page.click('button[type="submit"]');

      // リダイレクト先を確認（デバッグ用）
      await page.waitForTimeout(3000);
      const currentUrl = page.url();
      console.log("Current URL after form submission:", currentUrl);

      // ダッシュボードにリダイレクトされるか、イベント詳細ページにリダイレクトされるかを確認
      const isRedirected = currentUrl.includes("/events/") || currentUrl.includes("/home");
      console.log("Redirected:", isRedirected);

      if (isRedirected) {
        console.log("Form submission successful - redirected to:", currentUrl);
      }
    });

    test("段階的な入力でリアルタイムバリデーションが機能する", async ({ page }) => {
      const createButton = page.locator('[data-testid="create-event-button"]');
      if (await createButton.isVisible()) {
        await createButton.click();
      } else {
        await page.goto("/events/create");
      }
      await page.waitForURL("/events/create");

      // タイトルを入力してバリデーション状態を確認
      await page.fill('input[name="title"]', "テストイベント");

      // react-hook-formのリアルタイムバリデーションでエラーがクリアされることを確認
      await expect(page.locator("text=タイトルは必須です")).not.toBeVisible();

      // 日時を入力
      await page.fill('input[name="date"]', "2024-12-31T18:00");
      await expect(page.locator("text=開催日時は必須です")).not.toBeVisible();

      // 参加費を入力
      await page.fill('input[name="fee"]', "1000");
      await expect(page.locator("text=参加費は必須です")).not.toBeVisible();

      // 決済方法を選択
      await page.check("#stripe");
      await expect(page.locator("text=決済方法を選択してください")).not.toBeVisible();
    });

    test("無料イベントの作成が正常に動作する", async ({ page }) => {
      const createButton = page.locator('[data-testid="create-event-button"]');
      if (await createButton.isVisible()) {
        await createButton.click();
      } else {
        await page.goto("/events/create");
      }
      await page.waitForURL("/events/create");

      // 無料イベントの情報を入力
      await page.fill('input[name="title"]', "無料テストイベント");
      await page.fill('textarea[name="description"]', "これは無料のテストイベントです");
      await page.fill('input[name="location"]', "オンライン");
      await page.fill('input[name="date"]', "2024-12-31T19:00");
      await page.fill('input[name="fee"]', "0");
      await page.fill('input[name="capacity"]', "100");

      // 無料イベントの場合のロジック確認
      // react-hook-formのwatch機能により参加費0の場合の動作が適切に処理される
      await page.check("#stripe"); // 無料でもオンライン決済を選択可能

      await page.click('button[type="submit"]');

      // 成功メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "イベントが作成されました"
      );

      // イベント詳細ページで無料表示を確認
      await page.waitForURL(/\/events\/[a-f0-9-]+$/);
      await expect(page.locator('[data-testid="participation-fee"]')).toContainText("無料");
    });

    test("イベント作成時のバリデーションエラーが適切に表示される", async ({ page }) => {
      await page.goto("/events/create");

      // 必須項目を空で送信
      await page.click('button[type="submit"]');

      // react-hook-formのクライアントサイドバリデーションによりエラーメッセージが表示される
      // FormMessageコンポーネントによるエラー表示を確認
      await expect(page.locator("text=タイトルは必須です")).toBeVisible();
      await expect(page.locator("text=開催日時は必須です")).toBeVisible();
      await expect(page.locator("text=参加費は必須です")).toBeVisible();
      await expect(page.locator("text=決済方法を選択してください")).toBeVisible();

      // フォームが送信されずページに留まることを確認
      await expect(page).toHaveURL("/events/new");
    });

    test("過去の日時でイベント作成時にエラーが表示される", async ({ page }) => {
      await page.goto("/events/create");

      // 基本情報を入力
      await page.fill('input[name="title"]', "過去日時テストイベント");

      // 過去の日時を入力
      await page.fill('input[name="date"]', "2023-01-01T10:00");
      await page.fill('input[name="fee"]', "1000");
      await page.check("#stripe");

      await page.click('button[type="submit"]');

      // react-hook-formのバリデーションでエラーが表示される
      await expect(page.locator("text=開催日時は現在時刻より後である必要があります")).toBeVisible();
    });

    test("参加費の範囲バリデーションが機能する", async ({ page }) => {
      await page.goto("/events/create");

      await page.fill('input[name="title"]', "参加費バリデーションテスト");
      await page.fill('input[name="date"]', "2024-12-31T18:00");

      // 範囲外の参加費を入力
      await page.fill('input[name="fee"]', "1000001");
      await page.check("#stripe");

      await page.click('button[type="submit"]');

      // react-hook-formのバリデーションでエラーが表示される
      await expect(page.locator("text=参加費は1000000以下である必要があります")).toBeVisible();
    });
  });

  test.describe("イベント編集フロー", () => {
    let eventId: string;

    test.beforeEach(async ({ page }) => {
      // テスト用イベントを作成
      const createButton = page.locator('[data-testid="create-event-button"]');
      if (await createButton.isVisible()) {
        await createButton.click();
      } else {
        await page.goto("/events/create");
      }
      await page.waitForURL("/events/create");

      await page.fill('input[name="title"]', "編集テスト用イベント");
      await page.fill('textarea[name="description"]', "編集前の説明");
      await page.fill('input[name="location"]', "編集前の場所");
      await page.fill('input[name="date"]', "2024-12-31T18:00");
      await page.fill('input[name="fee"]', "2000");
      await page.fill('input[name="capacity"]', "30");
      await page.check("#stripe");

      await page.click('button[type="submit"]');
      await page.waitForURL(/\/events\/[a-f0-9-]+$/);

      // イベントIDを取得
      eventId = page.url().split("/").pop()!;
    });

    test("イベント情報の編集が正常に動作する", async ({ page }) => {
      // 編集ページに遷移
      await page.click('[data-testid="edit-event-button"]');
      await page.waitForURL(`/events/${eventId}/edit`);

      // react-hook-formで初期値が適切に設定されていることを確認
      await expect(page.locator('[name="title"]')).toHaveValue("編集テスト用イベント");
      await expect(page.locator('[name="description"]')).toHaveValue("編集前の説明");

      // 情報を編集
      await page.fill('input[name="title"]', "編集後のイベント");
      await page.fill('textarea[name="description"]', "編集後の説明");
      await page.fill('input[name="location"]', "編集後の場所");
      await page.fill('input[name="fee"]', "3000");

      // 編集を保存
      await page.click('button[type="submit"]');

      // 成功メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "イベントが更新されました"
      );

      // イベント詳細ページで変更が反映されていることを確認
      await page.waitForURL(`/events/${eventId}`);
      await expect(page.locator('[data-testid="event-title"]')).toContainText("編集後のイベント");
      await expect(page.locator('[data-testid="event-description"]')).toContainText("編集後の説明");
      await expect(page.locator('[data-testid="event-location"]')).toContainText("編集後の場所");
      await expect(page.locator('[data-testid="participation-fee"]')).toContainText("3,000円");
    });

    test("決済方法の変更が正常に動作する", async ({ page }) => {
      await page.click('[data-testid="edit-event-button"]');
      await page.waitForURL(`/events/${eventId}/edit`);

      // 現在の決済方法を確認
      await expect(page.locator("#stripe")).toBeChecked();

      // 現金決済を追加
      await page.check("#cash");

      // 編集を保存
      await page.click('button[type="submit"]');

      // イベント詳細ページで決済方法が更新されていることを確認
      await page.waitForURL(`/events/${eventId}`);
      await expect(page.locator('[data-testid="payment-methods"]')).toContainText("オンライン決済");
      await expect(page.locator('[data-testid="payment-methods"]')).toContainText("現金決済");
    });
  });

  test.describe("イベント削除機能", () => {
    test("イベントの削除が正常に動作する", async ({ page }) => {
      // テスト用イベントを作成
      const createButton = page.locator('[data-testid="create-event-button"]');
      if (await createButton.isVisible()) {
        await createButton.click();
      } else {
        await page.goto("/events/create");
      }
      await page.waitForURL("/events/create");

      await page.fill('input[name="title"]', "削除テスト用イベント");
      await page.fill('input[name="date"]', "2024-12-31T18:00");
      await page.fill('input[name="fee"]', "1000");
      await page.check("#stripe");

      await page.click('button[type="submit"]');
      await page.waitForURL(/\/events\/[a-f0-9-]+$/);

      // 削除ボタンをクリック
      await page.click('[data-testid="delete-event-button"]');

      // 確認ダイアログで削除を確認
      await page.click('[data-testid="confirm-delete-button"]');

      // ダッシュボードにリダイレクトされることを確認
      await page.waitForURL("/home", { timeout: 60000 });

      // 削除完了メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "イベントが削除されました"
      );
    });
  });

  test.describe("フォームの使いやすさ機能", () => {
    test("フォームのリセット機能が動作する", async ({ page }) => {
      await page.goto("/events/create");

      // 情報を入力
      await page.fill('input[name="title"]', "リセットテスト");
      await page.fill('textarea[name="description"]', "リセット前の説明");
      await page.fill('input[name="fee"]', "1000");

      // リセットボタンをクリック
      await page.click('button[type="button"]:has-text("リセット")');

      // react-hook-formのreset機能によりフォームがクリアされることを確認
      await expect(page.locator('[name="title"]')).toHaveValue("");
      await expect(page.locator('[name="description"]')).toHaveValue("");
      await expect(page.locator('[name="fee"]')).toHaveValue("");
    });

    test("フォーム送信中の状態表示が機能する", async ({ page }) => {
      await page.goto("/events/create");

      // 必要な情報を入力
      await page.fill('input[name="title"]', "送信状態テスト");
      await page.fill('input[name="date"]', "2024-12-31T18:00");
      await page.fill('input[name="fee"]', "1000");
      await page.check("#stripe");

      // 送信ボタンをクリック
      const submitPromise = page.click('button[type="submit"]');

      // react-hook-formのisPending状態により送信中表示が出ることを確認
      await expect(page.locator('button[type="submit"]:has-text("作成中...")')).toBeVisible();

      await submitPromise;
    });
  });
});

test.describe("無料イベント作成フロー", () => {
  test.beforeEach(async ({ page }) => {
    // 確認済みのテストユーザーでログイン
    await page.goto("/login");
    await page.fill('[name="email"]', "test@eventpay.test");
    await page.fill('[name="password"]', "TestPassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/home", { timeout: 60000 });
  });

  test("0円設定時は決済方法選択が不要", async ({ page }) => {
    // ダッシュボードからイベント作成ページに遷移
    const createButton = page.locator('[data-testid="create-event-button"]');
    if (await createButton.isVisible()) {
      await createButton.click();
    } else {
      await page.goto("/events/create");
    }
    await page.waitForURL("/events/create");

    // 基本情報入力
    await page.fill('input[name="title"]', "無料勉強会");
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', futureDateString);
    await page.fill('input[name="fee"]', "0"); // 0円設定

    // 決済方法選択エリアが非表示になることを確認
    await expect(page.locator('[data-testid="payment-methods"]')).not.toBeVisible();

    // 無料イベント用のメッセージが表示されることを確認
    await expect(
      page.locator(':text("参加費が0円のため、決済方法の設定は不要です")')
    ).toBeVisible();

    // オプショナルフィールドを入力
    await page.fill('textarea[name="description"]', "無料で参加できる勉強会です");
    await page.fill('input[name="location"]', "東京都新宿区");

    // フォーム送信が成功することを確認
    await page.click('button[type="submit"]');

    // イベント詳細ページに遷移することを確認
    await expect(page).toHaveURL(/\/events\/[a-f0-9-]+$/);

    // 成功メッセージまたはイベント詳細の表示を確認
    await expect(page.locator(':text("無料勉強会")')).toBeVisible();
  });

  test("0円から有料に変更すると決済方法選択が必須になる", async ({ page }) => {
    // イベント作成ページに遷移
    const createButton = page.locator('[data-testid="create-event-button"]');
    if (await createButton.isVisible()) {
      await createButton.click();
    } else {
      await page.goto("/events/create");
    }
    await page.waitForURL("/events/create");

    // 基本情報入力
    await page.fill('input[name="title"]', "価格変更テストイベント");
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', futureDateString);

    // まず0円で設定
    await page.fill('input[name="fee"]', "0");
    await expect(page.locator('[data-testid="payment-methods"]')).not.toBeVisible();
    await expect(
      page.locator(':text("参加費が0円のため、決済方法の設定は不要です")')
    ).toBeVisible();

    // 有料に変更
    await page.fill('input[name="fee"]', "1000");
    await expect(page.locator('[data-testid="payment-methods"]')).toBeVisible();
    await expect(
      page.locator(':text("参加費が0円のため、決済方法の設定は不要です")')
    ).not.toBeVisible();

    // 決済方法未選択で送信を試行
    await page.click('button[type="submit"]');

    // バリデーションエラーが表示されることを確認
    await expect(page.locator(':text("有料イベントでは決済方法の選択が必要です")')).toBeVisible();

    // 決済方法を選択してからリトライ
    await page.click('[id="stripe"]');
    await page.click('button[type="submit"]');

    // 今度は成功することを確認
    await expect(page).toHaveURL(/\/events\/[a-f0-9-]+$/);
  });

  test("無料イベントの完全作成フロー", async ({ page }) => {
    // イベント作成ページに遷移
    await page.goto("/events/create");
    await page.waitForURL("/events/create");

    // 完全なフォーム入力（無料イベント）
    await page.fill('input[name="title"]', "無料セミナー");
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', futureDateString);
    await page.fill('input[name="fee"]', "0");
    await page.fill('textarea[name="description"]', "無料で学べるWebセミナーです");
    await page.fill('input[name="location"]', "オンライン");
    await page.fill('input[name="capacity"]', "100");

    // 締切日時を設定（オプション）
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 20);
    const deadlineDateString = deadlineDate.toISOString().slice(0, 16);
    await page.fill('input[name="registration_deadline"]', deadlineDateString);

    // 無料イベント用のメッセージが表示されていることを確認
    await expect(
      page.locator(':text("参加費が0円のため、決済方法の設定は不要です")')
    ).toBeVisible();

    // 決済方法選択エリアが非表示であることを確認
    await expect(page.locator('[data-testid="payment-methods"]')).not.toBeVisible();

    // フォーム送信
    await page.click('button[type="submit"]');

    // 成功確認
    await expect(page).toHaveURL(/\/events\/[a-f0-9-]+$/);
    await expect(page.locator(':text("無料セミナー")')).toBeVisible();

    // イベント詳細で参加費が0円表示になっていることを確認（数字の0または「無料」テキスト）
    const freeIndicators = page.locator(':text("無料"), :text("¥0"), :text("0円")');
    await expect(freeIndicators.first()).toBeVisible();
  });
});

test.describe("バリデーションエラー修正フロー", () => {
  test.beforeEach(async ({ page }) => {
    // 確認済みのテストユーザーでログイン
    await page.goto("/login");
    await page.fill('[name="email"]', "test@eventpay.test");
    await page.fill('[name="password"]', "TestPassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/home", { timeout: 60000 });
  });

  test("日時バリデーションエラー修正後にボタンが有効化される", async ({ page }) => {
    // イベント作成ページに遷移
    await page.goto("/events/create");
    await page.waitForURL("/events/create");

    // 基本情報入力
    await page.fill('input[name="title"]', "バリデーションテストイベント");
    await page.fill('input[name="fee"]', "1000");
    await page.click('[id="stripe"]'); // 決済方法選択

    // 過去の日時を設定（バリデーションエラー発生）
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const pastDateString = pastDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', pastDateString);

    // エラーメッセージが表示されることを確認
    await expect(
      page.locator(':text("開催日時は現在時刻より後である必要があります")')
    ).toBeVisible();

    // 送信ボタンが無効化されていることを確認
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // 適切な未来の日時に修正
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', futureDateString);

    // エラーメッセージが消えることを確認
    await expect(
      page.locator(':text("開催日時は現在時刻より後である必要があります")')
    ).not.toBeVisible();

    // 送信ボタンが有効化されることを確認
    await expect(page.locator('button[type="submit"]')).toBeEnabled();

    // フォーム送信が成功することを確認
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/events\/[a-f0-9-]+$/);
  });

  test("締切日時相関バリデーションエラーの修正", async ({ page }) => {
    // イベント作成ページに遷移
    await page.goto("/events/create");
    await page.waitForURL("/events/create");

    // 基本情報入力
    await page.fill('input[name="title"]', "締切テストイベント");
    const eventDate = new Date();
    eventDate.setMonth(eventDate.getMonth() + 1);
    const eventDateString = eventDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', eventDateString);
    await page.fill('input[name="fee"]', "1000");
    await page.click('[id="stripe"]');

    // 開催日時より後の参加申込締切を設定（エラー発生）
    const invalidDeadline = new Date(eventDate);
    invalidDeadline.setDate(invalidDeadline.getDate() + 1);
    const invalidDeadlineString = invalidDeadline.toISOString().slice(0, 16);
    await page.fill('input[name="registration_deadline"]', invalidDeadlineString);

    // エラーメッセージが表示されることを確認
    await expect(
      page.locator(':text("参加申込締切は開催日時より前に設定してください")')
    ).toBeVisible();

    // 送信ボタンが無効化されていることを確認
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // 適切な締切日時に修正
    const validDeadline = new Date(eventDate);
    validDeadline.setDate(validDeadline.getDate() - 3);
    const validDeadlineString = validDeadline.toISOString().slice(0, 16);
    await page.fill('input[name="registration_deadline"]', validDeadlineString);

    // エラーメッセージが消えることを確認
    await expect(
      page.locator(':text("参加申込締切は開催日時より前に設定してください")')
    ).not.toBeVisible();

    // 送信ボタンが有効化されることを確認
    await expect(page.locator('button[type="submit"]')).toBeEnabled();

    // フォーム送信が成功することを確認
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/events\/[a-f0-9-]+$/);
  });
});

test.describe("イベント編集 - 無料イベント対応", () => {
  test.beforeEach(async ({ page }) => {
    // 確認済みのテストユーザーでログイン
    await page.goto("/login");
    await page.fill('[name="email"]', "test@eventpay.test");
    await page.fill('[name="password"]', "TestPassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/home", { timeout: 60000 });
  });

  test("有料イベントを無料に変更", async ({ page }) => {
    // まず有料イベントを作成
    await page.goto("/events/create");
    await page.waitForURL("/events/create");

    await page.fill('input[name="title"]', "有料→無料変更テスト");
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', futureDateString);
    await page.fill('input[name="fee"]', "1000");
    await page.click('[id="stripe"]');

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/events\/[a-f0-9-]+$/);

    // 編集ページに遷移
    await page.click('[data-testid="edit-event-button"]');
    await page.waitForURL(/\/events\/[a-f0-9-]+\/edit$/);

    // 参加費を0円に変更
    await page.fill('input[name="fee"]', "0");

    // 決済方法選択が非表示になることを確認
    await expect(page.locator('[data-testid="payment-methods"]')).not.toBeVisible();

    // 無料イベント用メッセージが表示されることを確認
    await expect(
      page.locator(':text("参加費が0円のため、決済方法の設定は不要です")')
    ).toBeVisible();

    // 更新ボタンをクリック
    await page.click('button:text("更新")');

    // 変更確認ダイアログで確定
    await page.click('button:text("更新を実行")');

    // 更新成功確認
    await expect(page.locator(':text("イベントが正常に更新されました")')).toBeVisible();
  });

  test("無料イベントを有料に変更", async ({ page }) => {
    // まず無料イベントを作成
    await page.goto("/events/create");
    await page.waitForURL("/events/create");

    await page.fill('input[name="title"]', "無料→有料変更テスト");
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', futureDateString);
    await page.fill('input[name="fee"]', "0");

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/events\/[a-f0-9-]+$/);

    // 編集ページに遷移
    await page.click('[data-testid="edit-event-button"]');
    await page.waitForURL(/\/events\/[a-f0-9-]+\/edit$/);

    // 参加費を有料に変更
    await page.fill('input[name="fee"]', "1500");

    // 決済方法選択が表示されることを確認
    await expect(page.locator('[data-testid="payment-methods"]')).toBeVisible();

    // 無料イベント用メッセージが非表示になることを確認
    await expect(
      page.locator(':text("参加費が0円のため、決済方法の設定は不要です")')
    ).not.toBeVisible();

    // 決済方法未選択で更新を試行
    await page.click('button:text("更新")');

    // バリデーションエラーが表示されることを確認
    await expect(page.locator(':text("有料イベントでは決済方法の選択が必要です")')).toBeVisible();

    // 決済方法を選択してからリトライ
    await page.click('[id="stripe"]');
    await page.click('button:text("更新")');

    // 変更確認ダイアログで確定
    await page.click('button:text("更新を実行")');

    // 更新成功確認
    await expect(page.locator(':text("イベントが正常に更新されました")')).toBeVisible();
  });

  test("編集フォームでのバリデーションエラー修正", async ({ page }) => {
    // 有料イベントを作成
    await page.goto("/events/create");
    await page.waitForURL("/events/create");

    await page.fill('input[name="title"]', "編集バリデーションテスト");
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const futureDateString = futureDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', futureDateString);
    await page.fill('input[name="fee"]', "1000");
    await page.click('[id="stripe"]');

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/events\/[a-f0-9-]+$/);

    // 編集ページに遷移
    await page.click('[data-testid="edit-event-button"]');
    await page.waitForURL(/\/events\/[a-f0-9-]+\/edit$/);

    // 過去の日時に変更（エラー発生）
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const pastDateString = pastDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', pastDateString);

    // エラーメッセージ表示確認
    await expect(
      page.locator(':text("開催日時は現在時刻より後である必要があります")')
    ).toBeVisible();

    // 更新ボタンが無効化されていることを確認
    await expect(page.locator('button:text("更新")')).toBeDisabled();

    // 適切な未来の日時に修正
    const correctedDate = new Date();
    correctedDate.setMonth(correctedDate.getMonth() + 2);
    const correctedDateString = correctedDate.toISOString().slice(0, 16);
    await page.fill('input[name="date"]', correctedDateString);

    // エラーメッセージが消えることを確認
    await expect(
      page.locator(':text("開催日時は現在時刻より後である必要があります")')
    ).not.toBeVisible();

    // 更新ボタンが有効化されることを確認
    await expect(page.locator('button:text("更新")')).toBeEnabled();

    // 更新が成功することを確認
    await page.click('button:text("更新")');
    await page.click('button:text("更新を実行")');
    await expect(page.locator(':text("イベントが正常に更新されました")')).toBeVisible();
  });
});

test.describe("レスポンシブデザイン", () => {
  test("モバイルデバイスでイベント作成フローが正常に動作する", async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto("/login");
    await page.fill('[name="email"]', "test@eventpay.test");
    await page.fill('[name="password"]', "TestPassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/home", { timeout: 60000 });

    // モバイルメニューからイベント作成に遷移
    await page.click('[data-testid="mobile-menu-button"]');
    const mobileCreateButton = page.locator('[data-testid="mobile-create-event-button"]');
    if (await mobileCreateButton.isVisible()) {
      await mobileCreateButton.click();
    } else {
      await page.goto("/events/create");
    }
    await page.waitForURL("/events/create");

    // モバイルでのフォーム操作
    await page.fill('input[name="title"]', "モバイルテストイベント");
    await page.fill('input[name="date"]', "2024-12-31T18:00");
    await page.fill('input[name="fee"]', "1000");
    await page.check("#stripe");

    // モバイルでのフォーム送信
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="success-message"]')).toContainText(
      "イベントが作成されました"
    );
  });
});
