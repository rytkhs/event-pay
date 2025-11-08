/**
 * リマインダー送信 統合テスト
 *
 * 📋 テスト対象：
 * - /api/cron/send-reminders エンドポイント
 * - ReminderService の動作
 * - 送信対象の抽出ロジック
 * - メール送信の統合
 *
 * 🎯 目的：
 * - 各リマインダー種別が正しい条件で送信されること
 * - Cron認証が正しく機能すること
 * - タイムゾーン変換が正しく動作すること
 * - エラーハンドリングが適切に行われること
 */

import { NextRequest } from "next/server";

import { addDays } from "date-fns";

import type { NotificationResult } from "@core/notification/types";
import { convertJstDateToUtcRange, formatDateToJstYmd } from "@core/utils/timezone";

import {
  createCommonTestSetup,
  createTestDataCleanupHelper,
  type CommonTestSetup,
} from "@tests/setup/common-test-setup";

import { GET as SendRemindersHandler } from "@/app/api/cron/send-reminders/route";
import { createTestEvent } from "@/tests/helpers/test-event";
import {
  createTestAttendance,
  createTestPaymentWithStatus,
} from "@/tests/helpers/test-payment-data";

import { setupEmailServiceMocks } from "../../setup/common-mocks";

// EmailNotificationServiceをモック（共通関数を使用するため、モック化のみ宣言）
jest.mock("@core/notification/email-service", () => ({
  EmailNotificationService: jest.fn(),
}));

describe("リマインダー送信 統合テスト", () => {
  let setup: CommonTestSetup;
  let cleanupHelper: ReturnType<typeof createTestDataCleanupHelper>;
  const originalCronSecret = process.env.CRON_SECRET;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `send-reminders-test-${Date.now()}`,
      withConnect: false,
      accessedTables: ["public.payments", "public.attendances", "public.events"],
    });

    // createTestDataCleanupHelperを使用してクリーンアップ処理を標準化
    cleanupHelper = createTestDataCleanupHelper(setup.adminClient);

    // 共通モックを使用してEmailNotificationServiceを設定
    setupEmailServiceMocks({ sendEmailSuccess: true, sendAdminAlertSuccess: true });

    // テスト用のCRON_SECRETを設定
    process.env.CRON_SECRET = "test-cron-secret-12345";

    // 時間を固定（2025-10-07 00:00:00 UTC = 2025-10-07 09:00:00 JST）
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-10-07T00:00:00.000Z"));
  });

  afterAll(async () => {
    await setup.cleanup();
    // 元のCRON_SECRETに戻す
    process.env.CRON_SECRET = originalCronSecret;
    // タイマーを元に戻す
    jest.useRealTimers();
  });

  beforeEach(() => {
    // EmailNotificationServiceのモックをリセット
  });

  afterEach(async () => {
    // テスト間でのデータクリーンアップ（createTestDataCleanupHelperを使用）
    try {
      await cleanupHelper.cleanup();
      cleanupHelper.reset();
    } catch (error) {
      console.warn("Inter-test cleanup failed:", error);
    }
  });

  /**
   * テストヘルパー: 翌日のJST日付範囲を取得
   * 固定時刻（2025-10-07 00:00:00 UTC = 2025-10-07 09:00:00 JST）を基準にする
   */
  function getTomorrowJstDateTime(): Date {
    // 固定時刻の翌日 = 2025-10-08
    const baseDate = new Date("2025-10-07T00:00:00.000Z");
    const tomorrow = addDays(baseDate, 1);
    const jstYmd = formatDateToJstYmd(tomorrow);
    const { startOfDay } = convertJstDateToUtcRange(jstYmd);
    // 翌日の正午(JST)をUTCに変換して返す
    return new Date(startOfDay.getTime() + 12 * 60 * 60 * 1000);
  }

  /**
   * テストヘルパー: 将来の日時を生成
   * 固定時刻（2025-10-07 00:00:00 UTC）を基準にする
   */
  function getFutureDateTime(daysFromNow: number = 7): Date {
    const baseDate = new Date("2025-10-07T00:00:00.000Z");
    return addDays(baseDate, daysFromNow);
  }

  /**
   * テストヘルパー: NextRequestをモック
   */
  function createMockRequest(options: { cronSecret?: string; useBearerToken?: boolean } = {}) {
    const { cronSecret, useBearerToken = true } = options;
    const headers = new Headers();

    if (cronSecret) {
      if (useBearerToken) {
        headers.set("authorization", `Bearer ${cronSecret}`);
      } else {
        headers.set("x-cron-secret", cronSecret);
      }
    }

    return new NextRequest("http://localhost:3000/api/cron/send-reminders", {
      method: "GET",
      headers,
    });
  }

  describe("認証", () => {
    test("正しいCRON_SECRETで認証成功", async () => {
      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);
    });

    test("誤ったCRON_SECRETで認証失敗", async () => {
      const request = createMockRequest({ cronSecret: "wrong-secret" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(401);
    });

    test("CRON_SECRETなしで認証失敗", async () => {
      const request = createMockRequest();
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(401);
    });

    test("x-cron-secretヘッダーでも認証成功", async () => {
      const request = createMockRequest({
        cronSecret: "test-cron-secret-12345",
        useBearerToken: false,
      });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);
    });
  });

  describe("参加期限リマインダー", () => {
    test("翌日が参加期限のmaybeステータスの参加者にリマインダーが送信される", async () => {
      const tomorrowDeadline = getTomorrowJstDateTime();
      const eventDate = getFutureDateTime(7);

      const event = await createTestEvent(setup.testUser.id, {
        title: "参加期限テストイベント",
        date: eventDate.toISOString(),
        fee: 0,
        registration_deadline: tomorrowDeadline.toISOString(),
        payment_methods: [],
      });
      cleanupHelper.trackEvent(event.id);

      const attendance1 = await createTestAttendance(event.id, {
        nickname: "未定参加者1",
        status: "maybe",
      });
      cleanupHelper.trackAttendance(attendance1.id);
      const attendance2 = await createTestAttendance(event.id, {
        nickname: "未定参加者2",
        status: "maybe",
      });
      cleanupHelper.trackAttendance(attendance2.id);
      const attendance3 = await createTestAttendance(event.id, {
        nickname: "参加確定者",
        status: "attending",
      }); // これは送信されない
      cleanupHelper.trackAttendance(attendance3.id);

      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);

      // 参加期限リマインダーのサマリーを確認
      const responseDeadlineSummary = body.summaries.find(
        (s: any) => s.reminderType === "response_deadline"
      );
      expect(responseDeadlineSummary).toBeDefined();
      expect(responseDeadlineSummary.totalTargets).toBe(2);
      expect(responseDeadlineSummary.successCount).toBe(2);
      expect(responseDeadlineSummary.failureCount).toBe(0);
    });

    test("参加期限が翌日でない場合はリマインダーが送信されない", async () => {
      const futureDeadline = getFutureDateTime(7);
      const eventDate = getFutureDateTime(14);

      const event = await createTestEvent(setup.testUser.id, {
        title: "未来の期限イベント",
        date: eventDate.toISOString(),
        fee: 0,
        registration_deadline: futureDeadline.toISOString(),
        payment_methods: [],
      });
      cleanupHelper.trackEvent(event.id);

      const attendance = await createTestAttendance(event.id, {
        nickname: "未定参加者",
        status: "maybe",
      });
      cleanupHelper.trackAttendance(attendance.id);

      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      const responseDeadlineSummary = body.summaries.find(
        (s: any) => s.reminderType === "response_deadline"
      );
      expect(responseDeadlineSummary.totalTargets).toBe(0);
    });
  });

  describe("決済期限リマインダー", () => {
    test("翌日が決済期限のStripe未決済者にリマインダーが送信される", async () => {
      const tomorrowDeadline = getTomorrowJstDateTime();
      const eventDate = getFutureDateTime(7);
      const registrationDeadline = addDays(tomorrowDeadline, -1);

      const event = await createTestEvent(setup.testUser.id, {
        title: "決済期限テストイベント",
        date: eventDate.toISOString(),
        fee: 3000,
        registration_deadline: registrationDeadline.toISOString(),
        payment_deadline: tomorrowDeadline.toISOString(),
        payment_methods: ["stripe"],
      });
      cleanupHelper.trackEvent(event.id);

      const attendance1 = await createTestAttendance(event.id, {
        nickname: "未決済参加者",
        status: "attending",
      });
      cleanupHelper.trackAttendance(attendance1.id);
      const payment1 = await createTestPaymentWithStatus(attendance1.id, {
        amount: 3000,
        status: "pending",
        method: "stripe",
      });
      cleanupHelper.trackPayment(payment1.id);

      const attendance2 = await createTestAttendance(event.id, {
        nickname: "決済済み参加者",
        status: "attending",
      });
      cleanupHelper.trackAttendance(attendance2.id);
      const payment2 = await createTestPaymentWithStatus(attendance2.id, {
        amount: 3000,
        status: "paid",
        method: "stripe",
      }); // 決済済みなので送信されない
      cleanupHelper.trackPayment(payment2.id);

      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      const paymentDeadlineSummary = body.summaries.find(
        (s: any) => s.reminderType === "payment_deadline"
      );
      expect(paymentDeadlineSummary).toBeDefined();
      expect(paymentDeadlineSummary.totalTargets).toBe(1);
      expect(paymentDeadlineSummary.successCount).toBe(1);
    });

    test("現金決済者にはリマインダーが送信されない", async () => {
      const tomorrowDeadline = getTomorrowJstDateTime();
      const eventDate = getFutureDateTime(7);
      const registrationDeadline = addDays(tomorrowDeadline, -1);

      const event = await createTestEvent(setup.testUser.id, {
        title: "現金決済イベント",
        date: eventDate.toISOString(),
        fee: 3000,
        registration_deadline: registrationDeadline.toISOString(),
        payment_deadline: tomorrowDeadline.toISOString(),
        payment_methods: ["stripe"],
      });
      cleanupHelper.trackEvent(event.id);

      const attendance = await createTestAttendance(event.id, {
        nickname: "現金決済参加者",
        status: "attending",
      });
      cleanupHelper.trackAttendance(attendance.id);
      const payment = await createTestPaymentWithStatus(attendance.id, {
        amount: 3000,
        status: "pending",
        method: "cash",
      });
      cleanupHelper.trackPayment(payment.id);

      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      const paymentDeadlineSummary = body.summaries.find(
        (s: any) => s.reminderType === "payment_deadline"
      );
      expect(paymentDeadlineSummary.totalTargets).toBe(0);
    });
  });

  describe("イベント開催リマインダー", () => {
    test("翌日が開催日の参加者にリマインダーが送信される", async () => {
      const tomorrowEvent = getTomorrowJstDateTime();
      const registrationDeadline = addDays(tomorrowEvent, -1);

      const event = await createTestEvent(setup.testUser.id, {
        title: "明日開催イベント",
        date: tomorrowEvent.toISOString(),
        fee: 0,
        registration_deadline: registrationDeadline.toISOString(),
        payment_methods: [],
      });
      cleanupHelper.trackEvent(event.id);

      const attendance1 = await createTestAttendance(event.id, {
        nickname: "参加者1",
        status: "attending",
      });
      cleanupHelper.trackAttendance(attendance1.id);
      const attendance2 = await createTestAttendance(event.id, {
        nickname: "参加者2",
        status: "attending",
      });
      cleanupHelper.trackAttendance(attendance2.id);
      const attendance3 = await createTestAttendance(event.id, {
        nickname: "未定者",
        status: "maybe",
      }); // これは送信されない
      cleanupHelper.trackAttendance(attendance3.id);

      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      const eventStartSummary = body.summaries.find((s: any) => s.reminderType === "event_start");
      expect(eventStartSummary).toBeDefined();
      expect(eventStartSummary.totalTargets).toBe(2);
      expect(eventStartSummary.successCount).toBe(2);
    });

    test("開催日が翌日でない場合はリマインダーが送信されない", async () => {
      const futureEvent = getFutureDateTime(7);
      const registrationDeadline = addDays(futureEvent, -1);

      const event = await createTestEvent(setup.testUser.id, {
        title: "未来のイベント",
        date: futureEvent.toISOString(),
        fee: 0,
        registration_deadline: registrationDeadline.toISOString(),
        payment_methods: [],
      });
      cleanupHelper.trackEvent(event.id);

      const attendance = await createTestAttendance(event.id, {
        nickname: "参加者",
        status: "attending",
      });
      cleanupHelper.trackAttendance(attendance.id);

      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      const eventStartSummary = body.summaries.find((s: any) => s.reminderType === "event_start");
      expect(eventStartSummary.totalTargets).toBe(0);
    });
  });

  describe("複合シナリオ", () => {
    test("複数種類のリマインダーが同時に送信される", async () => {
      const tomorrowDateTime = getTomorrowJstDateTime();

      // 参加期限リマインダー用イベント
      const event1 = await createTestEvent(setup.testUser.id, {
        title: "参加期限イベント",
        date: getFutureDateTime(7).toISOString(),
        fee: 0,
        registration_deadline: tomorrowDateTime.toISOString(),
        payment_methods: [],
      });
      cleanupHelper.trackEvent(event1.id);
      const attendance1 = await createTestAttendance(event1.id, {
        nickname: "未定者",
        status: "maybe",
      });
      cleanupHelper.trackAttendance(attendance1.id);

      // 決済期限リマインダー用イベント
      const registrationDeadline2 = addDays(tomorrowDateTime, -1);
      const event2 = await createTestEvent(setup.testUser.id, {
        title: "決済期限イベント",
        date: getFutureDateTime(7).toISOString(),
        fee: 2000,
        registration_deadline: registrationDeadline2.toISOString(),
        payment_deadline: tomorrowDateTime.toISOString(),
        payment_methods: ["stripe"],
      });
      cleanupHelper.trackEvent(event2.id);
      const attendance2 = await createTestAttendance(event2.id, {
        nickname: "未決済者",
        status: "attending",
      });
      cleanupHelper.trackAttendance(attendance2.id);
      const payment2 = await createTestPaymentWithStatus(attendance2.id, {
        amount: 2000,
        status: "pending",
        method: "stripe",
      });
      cleanupHelper.trackPayment(payment2.id);

      // イベント開催リマインダー用イベント
      const registrationDeadline3 = addDays(tomorrowDateTime, -1);
      const event3 = await createTestEvent(setup.testUser.id, {
        title: "明日開催イベント",
        date: tomorrowDateTime.toISOString(),
        fee: 0,
        registration_deadline: registrationDeadline3.toISOString(),
        payment_methods: [],
      });
      cleanupHelper.trackEvent(event3.id);
      const attendance3 = await createTestAttendance(event3.id, {
        nickname: "参加確定者",
        status: "attending",
      });
      cleanupHelper.trackAttendance(attendance3.id);

      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.summaries).toHaveLength(3);

      // 各リマインダーが送信されたことを確認
      const responseDeadline = body.summaries.find(
        (s: any) => s.reminderType === "response_deadline"
      );
      const paymentDeadline = body.summaries.find(
        (s: any) => s.reminderType === "payment_deadline"
      );
      const eventStart = body.summaries.find((s: any) => s.reminderType === "event_start");

      expect(responseDeadline.totalTargets).toBe(1);
      expect(paymentDeadline.totalTargets).toBe(1);
      expect(eventStart.totalTargets).toBe(1);

      expect(body.totalSent).toBe(3);
      expect(body.totalFailed).toBe(0);
    });

    test("送信対象がない場合は正常に完了する", async () => {
      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.totalSent).toBe(0);
      expect(body.totalFailed).toBe(0);
    });
  });

  describe("エラーハンドリング", () => {
    test("メール送信失敗時も処理は継続される", async () => {
      // メール送信を失敗させる
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { EmailNotificationService } = require("@core/notification/email-service");
      EmailNotificationService.mockImplementation(() => {
        return {
          sendEmail: jest.fn().mockResolvedValue({
            success: false,
            error: "送信失敗",
            errorType: "transient",
          } as NotificationResult),
          sendAdminAlert: jest.fn().mockResolvedValue({
            success: true,
            messageId: "test-admin-alert-id",
            retryCount: 0,
          } as NotificationResult),
        };
      });

      const tomorrowDateTime = getTomorrowJstDateTime();

      const event = await createTestEvent(setup.testUser.id, {
        title: "失敗テストイベント",
        date: getFutureDateTime(7).toISOString(),
        fee: 0,
        registration_deadline: tomorrowDateTime.toISOString(),
        payment_methods: [],
      });
      cleanupHelper.trackEvent(event.id);

      const attendance = await createTestAttendance(event.id, {
        nickname: "未定者",
        status: "maybe",
      });
      cleanupHelper.trackAttendance(attendance.id);

      const request = createMockRequest({ cronSecret: "test-cron-secret-12345" });
      const response = await SendRemindersHandler(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true); // Cronジョブ自体は成功

      const responseDeadlineSummary = body.summaries.find(
        (s: any) => s.reminderType === "response_deadline"
      );
      expect(responseDeadlineSummary.totalTargets).toBe(1);
      expect(responseDeadlineSummary.failureCount).toBe(1);
      expect(responseDeadlineSummary.errors).toHaveLength(1);
    });
  });
});
