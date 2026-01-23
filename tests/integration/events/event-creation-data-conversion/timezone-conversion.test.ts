/**
 * Event Creation Data Conversion: 日時のタイムゾーン変換テスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";

import { createEventAction } from "@/app/(app)/events/create/actions";

import {
  setupEventCreationDataConversionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  createFormDataFromFields,
  getFutureDateTime,
  type EventCreationDataConversionTestContext,
} from "./event-creation-data-conversion-test-setup";

describe("1.2.1 日時のタイムゾーン変換が正しく行われる", () => {
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
        context.createdEventIds.push(event.id);

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
        context.createdEventIds.push(event.id);

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
        context.createdEventIds.push(event.id);

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
