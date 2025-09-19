/**
 * イベント作成統合テスト - 1.2 データ変換・処理の確認
 *
 * このテストファイルは、イベント作成機能のデータ変換・処理に特化した統合テストを実装します。
 * - 1.2.1 日時のタイムゾーン変換が正しく行われる（datetime-local → UTC変換）
 * - 1.2.2 FormDataの適切な抽出と型変換（文字列から数値への変換）
 * - 1.2.3 決済方法配列の重複除去と正規化
 * - 1.2.4 サニタイズ処理が適用される（XSS対策）
 */

import { createEventAction } from "@features/events/actions/create-event";

import { deleteTestEvent } from "@/tests/helpers/test-event";
import { createTestUser, deleteTestUser, type TestUser } from "@/tests/helpers/test-user";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

describe("イベント作成統合テスト - 1.2 データ変換・処理の確認", () => {
  let testUser: TestUser;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    // テスト用ユーザーを作成
    testUser = await createTestUser(
      `data-conversion-test-${Date.now()}@example.com`,
      "TestPassword123"
    );
  });

  afterAll(async () => {
    // 作成したイベントをクリーンアップ
    for (const eventId of createdEventIds) {
      try {
        await deleteTestEvent(eventId);
      } catch (error) {
        console.warn(`Failed to cleanup event ${eventId}:`, error);
      }
    }

    // テストユーザーを削除
    await deleteTestUser(testUser.email);
  });

  beforeEach(() => {
    // 各テストでユーザーを認証済み状態にする
    process.env.TEST_USER_ID = testUser.id;
    process.env.TEST_USER_EMAIL = testUser.email;
  });

  afterEach(() => {
    // テスト環境の認証情報をクリア
    delete process.env.TEST_USER_ID;
    delete process.env.TEST_USER_EMAIL;
  });

  /**
   * テストヘルパー: FormDataを作成する
   */
  function createFormDataFromFields(fields: Record<string, string | string[]>): FormData {
    const formData = new FormData();

    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        formData.append(key, value.join(","));
      } else {
        formData.append(key, value);
      }
    }

    return formData;
  }

  /**
   * テストヘルパー: 将来の日時を生成する
   */
  function getFutureDateTime(hoursFromNow: number = 24): string {
    const futureDate = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    // datetime-localフォーマット（YYYY-MM-DDTHH:mm）
    return futureDate.toISOString().slice(0, 16);
  }

  describe("1.2.1 日時のタイムゾーン変換が正しく行われる", () => {
    describe("datetime-local → UTC変換", () => {
      test("基本的な日時変換が正しく行われる", async () => {
        const localDateTime = getFutureDateTime(48); // 48時間後
        const registrationDeadline = getFutureDateTime(24); // 24時間後

        const formData = createFormDataFromFields({
          title: "タイムゾーン変換テスト",
          date: localDateTime,
          fee: "0",
          registration_deadline: registrationDeadline,
          payment_methods: "",
        });

        const result = await createEventAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          // UTC形式のISO文字列として保存される（Z形式または+00:00形式）
          expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(\+00:00|Z)$/);
          expect(event.registration_deadline).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(\+00:00|Z)$/
          );

          // UTC時刻として解析可能
          const utcEventDate = new Date(event.date);
          const utcRegistrationDate = new Date(event.registration_deadline!);

          expect(utcEventDate).toBeInstanceOf(Date);
          expect(utcRegistrationDate).toBeInstanceOf(Date);
          expect(isNaN(utcEventDate.getTime())).toBe(false);
          expect(isNaN(utcRegistrationDate.getTime())).toBe(false);

          // JST→UTC変換により9時間前に変換される（JST=UTC+9）
          // datetime-localはJST時間として解釈され、UTCに変換される
          // 実際の時刻の変換確認（将来の時刻なので具体的な時刻ではなく変換の正しさを確認）
          const localEventDate = new Date(localDateTime + "+09:00"); // JSTとして解釈
          const expectedUtcTime = localEventDate.getTime();
          expect(utcEventDate.getTime()).toBe(expectedUtcTime);
        }
      });

      test("秒付きの日時も正しく変換される", async () => {
        // 将来の日時を生成（秒付き）
        const futureDate1 = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72時間後
        const futureDate2 = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間後
        const futureDate3 = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48時間後

        const localDateTimeWithSeconds = futureDate1.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
        const registrationDeadline = futureDate2.toISOString().slice(0, 19);
        const paymentDeadline = futureDate3.toISOString().slice(0, 19);

        const formData = createFormDataFromFields({
          title: "秒付き日時変換テスト",
          date: localDateTimeWithSeconds,
          fee: "1000",
          registration_deadline: registrationDeadline,
          payment_deadline: paymentDeadline,
          payment_methods: "stripe",
        });

        const result = await createEventAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          // 秒まで含むUTC形式で保存される
          const utcEventDate = new Date(event.date);
          const utcRegistrationDate = new Date(event.registration_deadline!);
          const utcPaymentDate = new Date(event.payment_deadline!);

          // 秒まで正しく保存されることを確認
          expect(utcEventDate).toBeInstanceOf(Date);
          expect(utcRegistrationDate).toBeInstanceOf(Date);
          expect(utcPaymentDate).toBeInstanceOf(Date);

          // JST→UTC変換が正しく行われることを確認（元の時刻との整合性）
          const expectedEventTime = new Date(localDateTimeWithSeconds + "+09:00").getTime();
          const expectedRegistrationTime = new Date(registrationDeadline + "+09:00").getTime();
          const expectedPaymentTime = new Date(paymentDeadline + "+09:00").getTime();

          expect(utcEventDate.getTime()).toBe(expectedEventTime);
          expect(utcRegistrationDate.getTime()).toBe(expectedRegistrationTime);
          expect(utcPaymentDate.getTime()).toBe(expectedPaymentTime);
        }
      });

      test("年越しの日時変換が正しく処理される", async () => {
        // 将来の年末年始の日時を生成
        const nextYear = new Date().getFullYear() + 1;
        const newYearDateTime = `${nextYear}-01-01T08:00`; // 翌年の日時
        const registrationDeadline = `${nextYear - 1}-12-31T23:30`; // 前年の日時

        const formData = createFormDataFromFields({
          title: "年越し日時変換テスト",
          date: newYearDateTime,
          fee: "0",
          registration_deadline: registrationDeadline,
          payment_methods: "",
        });

        const result = await createEventAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          const utcEventDate = new Date(event.date);
          const utcRegistrationDate = new Date(event.registration_deadline!);

          // 年越し時の変換が正しく処理されることを確認
          expect(utcEventDate).toBeInstanceOf(Date);
          expect(utcRegistrationDate).toBeInstanceOf(Date);

          // JST→UTC変換により9時間戻る
          // 元の日時との整合性を確認
          const expectedEventTime = new Date(newYearDateTime + "+09:00").getTime();
          const expectedRegistrationTime = new Date(registrationDeadline + "+09:00").getTime();

          expect(utcEventDate.getTime()).toBe(expectedEventTime);
          expect(utcRegistrationDate.getTime()).toBe(expectedRegistrationTime);
        }
      });
    });
  });

  describe("1.2.2 FormDataの適切な抽出と型変換", () => {
    describe("文字列から数値への変換（参加費、定員、猶予期間）", () => {
      test("参加費の文字列が正しく数値に変換される", async () => {
        const testCases = [
          { input: "0", expected: 0 },
          { input: "100", expected: 100 },
          { input: "1000", expected: 1000 },
          { input: "999999", expected: 999999 },
        ];

        for (const testCase of testCases) {
          const formData = createFormDataFromFields({
            title: `参加費変換テスト（${testCase.input}円）`,
            date: getFutureDateTime(72), // 72時間後
            fee: testCase.input,
            registration_deadline: getFutureDateTime(24), // 24時間後
            payment_methods: testCase.expected > 0 ? "stripe" : "",
          });

          // オンライン決済の場合は決済締切も追加
          if (testCase.expected > 0) {
            formData.append("payment_deadline", getFutureDateTime(48)); // 48時間後
          }

          const result = await createEventAction(formData);

          if (!result.success) {
            console.error(`参加費変換テスト失敗 (${testCase.input}):`, result);
          }
          expect(result.success).toBe(true);
          if (result.success) {
            const event = result.data;
            createdEventIds.push(event.id);

            expect(typeof event.fee).toBe("number");
            expect(event.fee).toBe(testCase.expected);
            expect(Number.isInteger(event.fee)).toBe(true);
          }
        }
      });

      test("定員の文字列が正しく数値に変換される", async () => {
        const testCases = [
          { input: "1", expected: 1 },
          { input: "10", expected: 10 },
          { input: "100", expected: 100 },
          { input: "1000", expected: 1000 },
          { input: "10000", expected: 10000 },
        ];

        for (const testCase of testCases) {
          const formData = createFormDataFromFields({
            title: `定員変換テスト（${testCase.input}名）`,
            date: getFutureDateTime(72),
            fee: "0",
            capacity: testCase.input,
            registration_deadline: getFutureDateTime(24),
            payment_methods: "",
          });

          const result = await createEventAction(formData);

          expect(result.success).toBe(true);
          if (result.success) {
            const event = result.data;
            createdEventIds.push(event.id);

            expect(typeof event.capacity).toBe("number");
            expect(event.capacity).toBe(testCase.expected);
            expect(Number.isInteger(event.capacity)).toBe(true);
          }
        }
      });

      test("猶予期間の文字列が正しく数値に変換される", async () => {
        const testCases = [
          { input: "0", expected: 0 },
          { input: "3", expected: 3 },
          { input: "7", expected: 7 },
          { input: "14", expected: 14 },
          { input: "30", expected: 30 },
        ];

        for (const testCase of testCases) {
          const formData = createFormDataFromFields({
            title: `猶予期間変換テスト（${testCase.input}日）`,
            date: getFutureDateTime(72),
            fee: "1000",
            grace_period_days: testCase.input,
            allow_payment_after_deadline: "true",
            registration_deadline: getFutureDateTime(24),
            payment_deadline: getFutureDateTime(48),
            payment_methods: "stripe",
          });

          const result = await createEventAction(formData);

          expect(result.success).toBe(true);
          if (result.success) {
            const event = result.data;
            createdEventIds.push(event.id);

            expect(typeof event.grace_period_days).toBe("number");
            expect(event.grace_period_days).toBe(testCase.expected);
            expect(Number.isInteger(event.grace_period_days)).toBe(true);
          }
        }
      });

      test("複数の数値項目が同時に正しく変換される", async () => {
        const formData = createFormDataFromFields({
          title: "複数数値変換テスト",
          date: getFutureDateTime(72),
          fee: "5000",
          capacity: "50",
          grace_period_days: "7",
          allow_payment_after_deadline: "true",
          registration_deadline: getFutureDateTime(24),
          payment_deadline: getFutureDateTime(48),
          payment_methods: "stripe,cash",
        });

        const result = await createEventAction(formData);

        if (!result.success) {
          console.error("複数数値変換テスト失敗:", result);
        }
        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          // 全ての数値項目が正しく変換される
          expect(typeof event.fee).toBe("number");
          expect(event.fee).toBe(5000);

          expect(typeof event.capacity).toBe("number");
          expect(event.capacity).toBe(50);

          expect(typeof event.grace_period_days).toBe("number");
          expect(event.grace_period_days).toBe(7);

          // boolean項目も正しく変換される
          expect(typeof event.allow_payment_after_deadline).toBe("boolean");
          expect(event.allow_payment_after_deadline).toBe(true);
        }
      });

      test("空文字列の数値項目が適切にデフォルト値に変換される", async () => {
        const formData = createFormDataFromFields({
          title: "空文字列数値変換テスト",
          date: getFutureDateTime(72),
          fee: "0",
          capacity: "", // 空文字列 → null
          grace_period_days: "", // 空文字列 → 0
          registration_deadline: getFutureDateTime(24),
          payment_methods: "",
        });

        const result = await createEventAction(formData);

        if (!result.success) {
          console.error("空文字列数値変換テスト失敗:", result);
        }
        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          // 定員が空文字列の場合はnullになる
          expect(event.capacity).toBeNull();

          // 猶予期間が空文字列の場合は0になる
          expect(typeof event.grace_period_days).toBe("number");
          expect(event.grace_period_days).toBe(0);
        }
      });
    });
  });

  describe("1.2.3 決済方法配列の重複除去と正規化", () => {
    test("重複した決済方法が自動的に除去される", async () => {
      const formData = createFormDataFromFields({
        title: "重複決済方法除去テスト",
        date: getFutureDateTime(72),
        fee: "1000",
        registration_deadline: getFutureDateTime(24),
        payment_deadline: getFutureDateTime(48),
        payment_methods: "stripe,cash,stripe,cash,stripe", // 意図的な重複
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        // 重複が除去されて2つの方法のみが保存される
        expect(Array.isArray(event.payment_methods)).toBe(true);
        expect(event.payment_methods.length).toBe(2);
        expect(event.payment_methods).toContain("stripe");
        expect(event.payment_methods).toContain("cash");

        // 順序は保持されるが重複は除去される
        const uniqueMethods = [...new Set(["stripe", "cash", "stripe", "cash", "stripe"])];
        expect(event.payment_methods).toEqual(uniqueMethods);
      }
    });

    test("単一の決済方法が正しく配列に格納される", async () => {
      const testCases = [
        { input: "stripe", expected: ["stripe"] },
        { input: "cash", expected: ["cash"] },
      ];

      for (const testCase of testCases) {
        const formData = createFormDataFromFields({
          title: `単一決済方法テスト（${testCase.input}）`,
          date: getFutureDateTime(72),
          fee: "1000",
          registration_deadline: getFutureDateTime(24),
          payment_methods: testCase.input,
        });

        if (testCase.input === "stripe") {
          formData.append("payment_deadline", getFutureDateTime(48));
        }

        const result = await createEventAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          expect(Array.isArray(event.payment_methods)).toBe(true);
          expect(event.payment_methods).toEqual(testCase.expected);
          expect(event.payment_methods.length).toBe(1);
        }
      }
    });

    test("空文字列の決済方法が空配列に正規化される", async () => {
      const formData = createFormDataFromFields({
        title: "空決済方法正規化テスト",
        date: getFutureDateTime(72),
        fee: "0", // 無料イベント
        registration_deadline: getFutureDateTime(24),
        payment_methods: "", // 空文字列
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        expect(Array.isArray(event.payment_methods)).toBe(true);
        expect(event.payment_methods).toEqual([]);
        expect(event.payment_methods.length).toBe(0);
      }
    });

    test("不正な決済方法は正規化される", async () => {
      // FormDataを直接構築してバリデーション前の不正な値をテスト
      const formData = new FormData();
      formData.append("title", "不正決済方法フィルタリングテスト");
      formData.append("date", getFutureDateTime(48));
      formData.append("fee", "1000");
      formData.append("registration_deadline", getFutureDateTime(24));
      formData.append("payment_deadline", getFutureDateTime(36));
      // 不正な決済方法を混入（正規化されることを確認）
      formData.append("payment_methods", "stripe,invalid_method,cash,another_invalid");

      const result = await createEventAction(formData);

      // 実際にはバリデーションエラーになるかもしれないので、両方のケースを対応
      if (!result.success) {
        expect(result.code).toBe("VALIDATION_ERROR");
        // 不正な決済方法によるバリデーションエラーメッセージを確認
        expect(result.fieldErrors).toBeDefined();
        if (result.fieldErrors) {
          const paymentMethodsError = result.fieldErrors.find(
            (err) => err.field === "payment_methods"
          );
          expect(paymentMethodsError).toBeDefined();
        }
      } else {
        // もしくは正規化されて成功する場合
        const event = result.data;
        createdEventIds.push(event.id);

        // 有効な決済方法のみが保存される
        expect(Array.isArray(event.payment_methods)).toBe(true);
        expect(event.payment_methods).toContain("stripe");
        expect(event.payment_methods).toContain("cash");
        expect(event.payment_methods).not.toContain("invalid_method");
        expect(event.payment_methods).not.toContain("another_invalid");
      }
    });

    test("無料イベントでは決済方法が強制的に空配列になる", async () => {
      const formData = createFormDataFromFields({
        title: "無料イベント決済方法強制空配列テスト",
        date: getFutureDateTime(72),
        fee: "0", // 無料
        registration_deadline: getFutureDateTime(24),
        payment_methods: "stripe,cash", // 決済方法を指定しても無視される
        payment_deadline: getFutureDateTime(48), // Zodバリデーションを通すために一時的に設定（実際は使用されない）
      });

      const result = await createEventAction(formData);

      if (!result.success) {
        console.error("無料イベント決済方法強制空配列テスト失敗:", result);
      }
      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        // 無料イベントでは決済方法が強制的に空配列になる
        expect(event.fee).toBe(0);
        expect(Array.isArray(event.payment_methods)).toBe(true);
        expect(event.payment_methods).toEqual([]);
        expect(event.payment_methods.length).toBe(0);
        // 無料イベントではpayment_deadlineもnullになる
        expect(event.payment_deadline).toBeNull();
      }
    });
  });

  describe("1.2.4 サニタイズ処理が適用される", () => {
    describe("タイトル、場所、説明のXSS対策", () => {
      test("タイトルのHTMLタグが除去される", async () => {
        const maliciousTitle =
          '<script>alert("XSS")</script>テストイベント<img src="x" onerror="alert(1)">';
        const expectedTitle = "テストイベント"; // HTMLタグが除去される

        const formData = createFormDataFromFields({
          title: maliciousTitle,
          date: getFutureDateTime(72),
          fee: "0",
          registration_deadline: getFutureDateTime(24),
          payment_methods: "",
        });

        const result = await createEventAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          expect(event.title).toBe(expectedTitle);
          expect(event.title).not.toContain("<script>");
          expect(event.title).not.toContain("<img");
          expect(event.title).not.toContain("onerror");
          expect(event.title).not.toContain("alert");
        }
      });

      test("場所のHTMLタグが除去される", async () => {
        const maliciousLocation =
          '東京都<script>alert("location")</script>渋谷区<iframe src="evil.com"></iframe>';
        const expectedLocation = "東京都渋谷区"; // HTMLタグが除去される

        const formData = createFormDataFromFields({
          title: "場所サニタイズテスト",
          date: getFutureDateTime(72),
          fee: "0",
          location: maliciousLocation,
          registration_deadline: getFutureDateTime(24),
          payment_methods: "",
        });

        const result = await createEventAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          expect(event.location).toBe(expectedLocation);
          expect(event.location).not.toContain("<script>");
          expect(event.location).not.toContain("<iframe>");
          expect(event.location).not.toContain('src="evil.com"');
          expect(event.location).not.toContain("alert");
        }
      });

      test("説明のHTMLタグが除去される（改行は保持）", async () => {
        const maliciousDescription = `テストイベントの説明です。
<script>alert("desc")</script>
改行は保持されます。
<img src="x" onerror="alert('xss')">
<a href="javascript:alert('link')">悪意のあるリンク</a>
最後の行です。`;

        const expectedDescription = `テストイベントの説明です。

改行は保持されます。

悪意のあるリンク
最後の行です。`; // HTMLタグは除去、改行とテキストは保持

        const formData = createFormDataFromFields({
          title: "説明サニタイズテスト",
          date: getFutureDateTime(72),
          fee: "0",
          description: maliciousDescription,
          registration_deadline: getFutureDateTime(24),
          payment_methods: "",
        });

        const result = await createEventAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          expect(event.description).toBe(expectedDescription);
          expect(event.description).not.toContain("<script>");
          expect(event.description).not.toContain("<img");
          expect(event.description).not.toContain("<a");
          expect(event.description).not.toContain("onerror");
          expect(event.description).not.toContain("javascript:");
          expect(event.description).not.toContain("alert");

          // 改行は保持される
          expect(event.description).toContain("\n");
        }
      });

      test("複数のフィールドが同時にサニタイズされる", async () => {
        const maliciousData = {
          title: '<script>alert("title")</script>複数フィールドテスト',
          location: '東京都<img src="x" onerror="alert(2)">渋谷区',
          description: `説明文です。
<script>document.cookie="stolen"</script>
<style>body{display:none}</style>
危険なコンテンツを含みます。`,
        };

        const expectedData = {
          title: "複数フィールドテスト",
          location: "東京都渋谷区",
          description: `説明文です。


危険なコンテンツを含みます。`,
        };

        const formData = createFormDataFromFields({
          title: maliciousData.title,
          date: getFutureDateTime(72),
          fee: "0",
          location: maliciousData.location,
          description: maliciousData.description,
          registration_deadline: getFutureDateTime(24),
          payment_methods: "",
        });

        const result = await createEventAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          // 全フィールドが適切にサニタイズされる
          expect(event.title).toBe(expectedData.title);
          expect(event.location).toBe(expectedData.location);
          expect(event.description).toBe(expectedData.description);

          // 危険なタグが全て除去されている
          const dangerousTags = [
            "<script>",
            "<img",
            "<style>",
            "onerror",
            "document.cookie",
            "alert",
          ];
          dangerousTags.forEach((tag) => {
            expect(event.title).not.toContain(tag);
            expect(event.location).not.toContain(tag);
            expect(event.description).not.toContain(tag);
          });
        }
      });

      test("通常のテキストはサニタイズの影響を受けない", async () => {
        const normalData = {
          title: "通常のイベントタイトル 123 ★",
          location: "東京都渋谷区神宮前1-1-1 (テストビル3F)",
          description: `これは通常のイベント説明です。
日本語、English、数字123、記号!@#$%^&*()が含まれます。
URL: https://example.com
メール: test@example.com
改行も含まれています。`,
        };

        const formData = createFormDataFromFields({
          title: normalData.title,
          date: getFutureDateTime(72),
          fee: "0",
          location: normalData.location,
          description: normalData.description,
          registration_deadline: getFutureDateTime(24),
          payment_methods: "",
        });

        const result = await createEventAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
          const event = result.data;
          createdEventIds.push(event.id);

          // 通常のテキストは変更されない
          expect(event.title).toBe(normalData.title);
          expect(event.location).toBe(normalData.location);
          expect(event.description).toBe(normalData.description);
        }
      });
    });
  });
});
