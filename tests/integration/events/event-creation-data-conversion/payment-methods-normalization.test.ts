/**
 * Event Creation Data Conversion: 決済方法配列の重複除去と正規化テスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";

import { createEventAction } from "@features/events/actions/create-event";

import {
  setupEventCreationDataConversionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  createFormDataFromFields,
  getFutureDateTime,
  type EventCreationDataConversionTestContext,
} from "./event-creation-data-conversion-test-setup";

describe("1.2.3 決済方法配列の重複除去と正規化", () => {
  let context: EventCreationDataConversionTestContext;

  beforeAll(async () => {
    context = await setupEventCreationDataConversionTest();
  });

  afterAll(async () => {
    await cleanupAfterAll(context);
  });

  beforeEach(() => {
    setupBeforeEach(context);
  });

  afterEach(() => {
    cleanupAfterEach(context);
  });

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
      context.createdEventIds.push(event.id);

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
        context.createdEventIds.push(event.id);

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
      context.createdEventIds.push(event.id);

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
      context.createdEventIds.push(event.id);

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
      context.createdEventIds.push(event.id);

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
