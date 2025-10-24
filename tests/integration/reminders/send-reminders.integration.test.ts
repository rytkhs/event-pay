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
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { convertJstDateToUtcRange, formatDateToJstYmd } from "@core/utils/timezone";

import { createTestUser, deleteTestUser, type TestUser } from "@tests/helpers/test-user";

import { GET as SendRemindersHandler } from "@/app/api/cron/send-reminders/route";

// EmailNotificationServiceをモック
jest.mock("@core/notification/email-service", () => {
  return {
    EmailNotificationService: jest.fn().mockImplementation(() => {
      return {
        sendEmail: jest.fn().mockResolvedValue({
          success: true,
          messageId: "test-message-id",
          retryCount: 0,
        }),
        sendAdminAlert: jest.fn().mockResolvedValue({
          success: true,
          messageId: "test-admin-alert-id",
          retryCount: 0,
        }),
      };
    }),
  };
});

describe("リマインダー送信 統合テスト", () => {
  let testUser: TestUser;
  const createdEventIds: string[] = [];
  const createdAttendanceIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const secureFactory = SecureSupabaseClientFactory.create();
  const originalCronSecret = process.env.CRON_SECRET;

  beforeAll(async () => {
    // テスト用ユーザーを作成
    testUser = await createTestUser(`reminder-test-${Date.now()}@example.com`, "TestPassword123");

    // テスト用のCRON_SECRETを設定
    process.env.CRON_SECRET = "test-cron-secret-12345";

    // 時間を固定（2025-10-07 00:00:00 UTC = 2025-10-07 09:00:00 JST）
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-10-07T00:00:00.000Z"));
  });

  afterAll(async () => {
    await deleteTestUser(testUser.email);
    // 元のCRON_SECRETに戻す
    process.env.CRON_SECRET = originalCronSecret;
    // タイマーを元に戻す
    jest.useRealTimers();
  });

  beforeEach(() => {
    // EmailNotificationServiceのモックをリセット
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // テスト間でのデータクリーンアップ
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_CLEANUP,
      "Reminder test cleanup",
      {
        accessedTables: ["public.payments", "public.attendances", "public.events"],
      }
    );

    // 決済レコードを削除
    if (createdPaymentIds.length > 0) {
      await adminClient.from("payments").delete().in("id", createdPaymentIds);
      createdPaymentIds.length = 0;
    }

    // 参加レコードを削除
    if (createdAttendanceIds.length > 0) {
      await adminClient.from("attendances").delete().in("id", createdAttendanceIds);
      createdAttendanceIds.length = 0;
    }

    // イベントを削除
    if (createdEventIds.length > 0) {
      await adminClient.from("events").delete().in("id", createdEventIds);
      createdEventIds.length = 0;
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
   * テストヘルパー: テストイベントを作成
   */
  async function createEvent(options: {
    title: string;
    date: Date;
    fee: number;
    registration_deadline?: Date | null;
    payment_deadline?: Date | null;
  }) {
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Creating test event for reminders",
      {
        operationType: "INSERT",
        accessedTables: ["public.events"],
      }
    );

    // registration_deadlineが指定されていない場合のデフォルト値を決定
    let defaultRegistrationDeadline: Date | null;
    if (options.registration_deadline !== undefined) {
      defaultRegistrationDeadline = options.registration_deadline;
    } else if (options.payment_deadline) {
      // payment_deadlineが指定されている場合は、その1日前をregistration_deadlineとする
      defaultRegistrationDeadline = addDays(options.payment_deadline, -1);
    } else {
      // それ以外はイベント日付の前日をデフォルトとする
      defaultRegistrationDeadline = addDays(options.date, -1);
    }

    const { data: event, error } = await adminClient
      .from("events")
      .insert({
        title: options.title,
        date: options.date.toISOString(),
        fee: options.fee,
        created_by: testUser.id,
        registration_deadline:
          defaultRegistrationDeadline?.toISOString() ?? options.date.toISOString(),
        payment_deadline: options.payment_deadline?.toISOString() || null,
        payment_methods: options.fee > 0 ? ["stripe"] : [],
        invite_token: `test-token-${Date.now()}-${Math.random()}`,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create event: ${error.message}`);
    }

    createdEventIds.push(event.id);
    return event;
  }

  /**
   * テストヘルパー: 参加者を作成
   */
  async function createAttendance(
    eventId: string,
    status: "attending" | "not_attending" | "maybe",
    nickname: string
  ) {
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Creating test attendance for reminders",
      {
        operationType: "INSERT",
        accessedTables: ["public.attendances"],
      }
    );

    const randomId = Math.random().toString(36).substring(2, 12);
    const email = `test${randomId}@example.com`;
    const randomBytes =
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const guestToken = `gst_${randomBytes.substring(0, 32)}`;

    const { data: attendance, error } = await adminClient
      .from("attendances")
      .insert({
        event_id: eventId,
        email: email,
        nickname: nickname,
        status: status,
        guest_token: guestToken,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create attendance: ${error.message}`);
    }

    createdAttendanceIds.push(attendance.id);
    return attendance;
  }

  /**
   * テストヘルパー: 決済レコードを作成
   */
  async function createPayment(
    attendanceId: string,
    amount: number,
    status: "paid" | "received" | "pending" | "failed",
    method: "stripe" | "cash"
  ) {
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Creating test payment for reminders",
      {
        operationType: "INSERT",
        accessedTables: ["public.payments"],
      }
    );

    const paidAt = ["paid", "received"].includes(status) ? new Date().toISOString() : null;
    const stripePaymentIntentId =
      method === "stripe" ? `pi_test_${Math.random().toString(36).substring(2, 15)}` : null;

    const { data: payment, error } = await adminClient
      .from("payments")
      .insert({
        attendance_id: attendanceId,
        amount: amount,
        status: status,
        method: method,
        paid_at: paidAt,
        stripe_payment_intent_id: stripePaymentIntentId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create payment: ${error.message}`);
    }

    createdPaymentIds.push(payment.id);
    return payment;
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

      const event = await createEvent({
        title: "参加期限テストイベント",
        date: eventDate,
        fee: 0,
        registration_deadline: tomorrowDeadline,
      });

      await createAttendance(event.id, "maybe", "未定参加者1");
      await createAttendance(event.id, "maybe", "未定参加者2");
      await createAttendance(event.id, "attending", "参加確定者"); // これは送信されない

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

      const event = await createEvent({
        title: "未来の期限イベント",
        date: eventDate,
        fee: 0,
        registration_deadline: futureDeadline,
      });

      await createAttendance(event.id, "maybe", "未定参加者");

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

      const event = await createEvent({
        title: "決済期限テストイベント",
        date: eventDate,
        fee: 3000,
        payment_deadline: tomorrowDeadline,
      });

      const attendance1 = await createAttendance(event.id, "attending", "未決済参加者");
      await createPayment(attendance1.id, 3000, "pending", "stripe");

      const attendance2 = await createAttendance(event.id, "attending", "決済済み参加者");
      await createPayment(attendance2.id, 3000, "paid", "stripe"); // 決済済みなので送信されない

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

      const event = await createEvent({
        title: "現金決済イベント",
        date: eventDate,
        fee: 3000,
        payment_deadline: tomorrowDeadline,
      });

      const attendance = await createAttendance(event.id, "attending", "現金決済参加者");
      await createPayment(attendance.id, 3000, "pending", "cash");

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

      const event = await createEvent({
        title: "明日開催イベント",
        date: tomorrowEvent,
        fee: 0,
      });

      await createAttendance(event.id, "attending", "参加者1");
      await createAttendance(event.id, "attending", "参加者2");
      await createAttendance(event.id, "maybe", "未定者"); // これは送信されない

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

      const event = await createEvent({
        title: "未来のイベント",
        date: futureEvent,
        fee: 0,
      });

      await createAttendance(event.id, "attending", "参加者");

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
      const event1 = await createEvent({
        title: "参加期限イベント",
        date: getFutureDateTime(7),
        fee: 0,
        registration_deadline: tomorrowDateTime,
      });
      await createAttendance(event1.id, "maybe", "未定者");

      // 決済期限リマインダー用イベント
      const event2 = await createEvent({
        title: "決済期限イベント",
        date: getFutureDateTime(7),
        fee: 2000,
        payment_deadline: tomorrowDateTime,
      });
      const attendance2 = await createAttendance(event2.id, "attending", "未決済者");
      await createPayment(attendance2.id, 2000, "pending", "stripe");

      // イベント開催リマインダー用イベント
      const event3 = await createEvent({
        title: "明日開催イベント",
        date: tomorrowDateTime,
        fee: 0,
      });
      await createAttendance(event3.id, "attending", "参加確定者");

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

      const event = await createEvent({
        title: "失敗テストイベント",
        date: getFutureDateTime(7),
        fee: 0,
        registration_deadline: tomorrowDateTime,
      });

      await createAttendance(event.id, "maybe", "未定者");

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
