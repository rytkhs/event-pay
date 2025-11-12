/**
 * Event Creation Data Conversion: FormDataの適切な抽出と型変換テスト
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

describe("1.2.2 FormDataの適切な抽出と型変換", () => {
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
          context.createdEventIds.push(event.id);

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
          context.createdEventIds.push(event.id);

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
          context.createdEventIds.push(event.id);

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
        context.createdEventIds.push(event.id);

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
        context.createdEventIds.push(event.id);

        // 定員が空文字列の場合はnullになる
        expect(event.capacity).toBeNull();

        // 猶予期間が空文字列の場合は0になる
        expect(typeof event.grace_period_days).toBe("number");
        expect(event.grace_period_days).toBe(0);
      }
    });
  });
});
