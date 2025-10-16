/**
 * 決済キャンセル処理統合テスト
 *
 * 仕様書: docs/spec/add-canceled-status/design-v2.md
 *
 * 目的:
 * - update_guest_attendance_with_payment RPC関数のキャンセル処理を包括的に検証
 * - 未決済系（pending/failed）→ canceled への遷移
 * - 決済完了（paid/received）→ ステータス維持
 * - waived → 維持
 * - 無料イベント → レコード作成なし
 */

import { jest } from "@jest/globals";

import { SecureSupabaseClientFactory } from "../../../core/security/secure-client-factory.impl";
import { AdminReason } from "../../../core/security/secure-client-factory.types";
import type { Database } from "../../../types/database";
import {
  createTestUserWithConnect,
  createPaidTestEvent,
  createTestAttendance,
  cleanupTestPaymentData,
  type TestPaymentUser,
  type TestPaymentEvent,
} from "../../helpers/test-payment-data";

type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];
type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];

describe("決済キャンセル処理統合テスト", () => {
  let adminClient: any;
  let testUser: TestPaymentUser;
  let testEvent: TestPaymentEvent;

  beforeAll(async () => {
    console.log("🔧 決済キャンセル処理統合テスト セットアップ開始");

    const secureFactory = SecureSupabaseClientFactory.getInstance();
    adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Payment cancellation integration test setup",
      {
        operationType: "INSERT",
        accessedTables: ["public.users", "public.events", "public.attendances", "public.payments"],
        additionalInfo: { testContext: "payment-cancellation-integration" },
      }
    );

    // テストユーザー作成
    testUser = await createTestUserWithConnect(`cancel-test-${Date.now()}@example.com`);

    // 有料テストイベント作成
    testEvent = await createPaidTestEvent(testUser.id, {
      title: "決済キャンセルテストイベント",
      fee: 1000,
    });

    console.log(`✅ テストデータセットアップ完了 - Event: ${testEvent.id}`);
  });

  afterAll(async () => {
    console.log("🧹 テストデータクリーンアップ開始");

    // 関連データを削除
    await cleanupTestPaymentData([testUser], [testEvent]);

    console.log("✅ テストデータクリーンアップ完了");
  });

  beforeEach(async () => {
    // 各テスト前に古い attendances をクリーンアップ
    await adminClient.from("attendances").delete().eq("event_id", testEvent.id);
  });

  /**
   * ヘルパー: テスト用の参加者を作成（ローカル）
   */
  async function createLocalTestAttendance(
    status: AttendanceStatus = "attending"
  ): Promise<{ id: string; event_id: string }> {
    return await createTestAttendance(testEvent.id, {
      email: `participant-${Date.now()}@example.com`,
      nickname: `テスト参加者-${Date.now()}`,
      status,
    });
  }

  /**
   * ヘルパー: 決済レコードを作成
   */
  async function createTestPayment(
    attendanceId: string,
    status: PaymentStatus,
    method: "cash" | "stripe" = "cash"
  ): Promise<{ id: string; status: PaymentStatus }> {
    const paymentData: any = {
      attendance_id: attendanceId,
      amount: 1000,
      method,
      status,
    };

    // 高位ステータスには必須フィールドを設定
    if (["paid", "received", "refunded", "waived"].includes(status)) {
      paymentData.paid_at = new Date().toISOString();
    }

    if (["paid", "failed", "waived"].includes(status)) {
      paymentData.stripe_payment_intent_id = `pi_test_${status}_${Date.now()}`;
    }

    const { data, error } = await adminClient
      .from("payments")
      .insert(paymentData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * ヘルパー: 監査ログを取得
   */
  async function getSystemLogs(attendanceId: string): Promise<any[]> {
    const { data, error } = await adminClient
      .from("system_logs")
      .select("*")
      .filter("details->>attendanceId", "eq", attendanceId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  describe("未決済系（pending/failed）のキャンセル", () => {
    test("pending → canceled: 参加キャンセル時に pending は canceled に遷移", async () => {
      // Arrange
      const attendance = await createLocalTestAttendance("attending");
      const payment = await createTestPayment(attendance.id, "pending");

      // Act: 参加をキャンセル（not_attending に変更）
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 1000,
      });

      // Assert
      expect(error).toBeNull();

      // 決済ステータスが canceled に更新されたことを確認
      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("canceled");
      expect(updatedPayment.paid_at).toBeNull();

      // 監査ログに payment_canceled が記録されていることを確認
      const logs = await getSystemLogs(attendance.id);
      const cancelLog = logs.find((log) => log.operation_type === "payment_canceled");
      expect(cancelLog).toBeDefined();
      expect(cancelLog.details.previousStatus).toBe("pending");
      expect(cancelLog.details.newStatus).toBe("canceled");
    });

    test("failed → canceled: 参加キャンセル時に failed は canceled に遷移", async () => {
      // Arrange
      const attendance = await createLocalTestAttendance("attending");
      const payment = await createTestPayment(attendance.id, "failed");

      // Act
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 1000,
      });

      // Assert
      expect(error).toBeNull();

      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("canceled");

      const logs = await getSystemLogs(attendance.id);
      const cancelLog = logs.find((log) => log.operation_type === "payment_canceled");
      expect(cancelLog).toBeDefined();
      expect(cancelLog.details.previousStatus).toBe("failed");
    });

    test("pending → maybe でも canceled に遷移", async () => {
      // Arrange
      const attendance = await createLocalTestAttendance("attending");
      const payment = await createTestPayment(attendance.id, "pending");

      // Act: 未定に変更
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "maybe",
        p_payment_method: null,
        p_event_fee: 1000,
      });

      // Assert
      expect(error).toBeNull();

      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("canceled");
    });
  });

  describe("決済完了（paid/received）のキャンセル", () => {
    test("paid: 参加キャンセル時に paid ステータスは維持される", async () => {
      // Arrange
      const attendance = await createLocalTestAttendance("attending");
      const payment = await createTestPayment(attendance.id, "paid", "stripe");

      const originalPaidAt = payment.paid_at;

      // Act
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 1000,
      });

      // Assert
      expect(error).toBeNull();

      // 決済ステータスが paid のまま維持されることを確認
      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("paid");
      expect(updatedPayment.paid_at).toBe(originalPaidAt);

      // 監査ログに payment_status_maintained_on_cancel が記録されていることを確認
      const logs = await getSystemLogs(attendance.id);
      const maintainLog = logs.find(
        (log) => log.operation_type === "payment_status_maintained_on_cancel"
      );
      expect(maintainLog).toBeDefined();
      expect(maintainLog.details.paymentStatus).toBe("paid");
      expect(maintainLog.details.paymentMethod).toBe("stripe");
    });

    test("received: 参加キャンセル時に received ステータスは維持される", async () => {
      // Arrange
      const attendance = await createLocalTestAttendance("attending");
      const payment = await createTestPayment(attendance.id, "received", "cash");

      // Act
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 1000,
      });

      // Assert
      expect(error).toBeNull();

      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("received");

      const logs = await getSystemLogs(attendance.id);
      const maintainLog = logs.find(
        (log) => log.operation_type === "payment_status_maintained_on_cancel"
      );
      expect(maintainLog).toBeDefined();
      expect(maintainLog.details.paymentStatus).toBe("received");
      expect(maintainLog.details.paymentMethod).toBe("cash");
    });
  });

  describe("waived（免除）のキャンセル", () => {
    test("waived: 参加キャンセル時に waived ステータスは維持される", async () => {
      // Arrange
      const attendance = await createLocalTestAttendance("attending");
      const payment = await createTestPayment(attendance.id, "waived");

      // Act
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 1000,
      });

      // Assert
      expect(error).toBeNull();

      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("waived");

      // 監査ログに waived_payment_kept が記録されていることを確認
      const logs = await getSystemLogs(attendance.id);
      const maintainLog = logs.find((log) => log.operation_type === "waived_payment_kept");
      expect(maintainLog).toBeDefined();
    });
  });

  describe("refunded（返金済み）のキャンセル", () => {
    test("refunded: 参加キャンセル時に refunded ステータスは維持される", async () => {
      // Arrange
      const attendance = await createLocalTestAttendance("attending");
      const payment = await createTestPayment(attendance.id, "refunded");

      // Act
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 1000,
      });

      // Assert
      expect(error).toBeNull();

      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("refunded");

      const logs = await getSystemLogs(attendance.id);
      const maintainLog = logs.find(
        (log) => log.operation_type === "refund_status_maintained_on_cancel"
      );
      expect(maintainLog).toBeDefined();
    });
  });

  describe("canceled の冪等性", () => {
    test("canceled → canceled: 再キャンセル時に canceled ステータスは維持される", async () => {
      // Arrange
      const attendance = await createLocalTestAttendance("not_attending");
      const payment = await createTestPayment(attendance.id, "canceled");

      // Act: 再度キャンセル（すでに not_attending だが、maybe → not_attending などを想定）
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 1000,
      });

      // Assert
      expect(error).toBeNull();

      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("canceled");

      // 監査ログに payment_canceled_duplicate が記録されていることを確認
      const logs = await getSystemLogs(attendance.id);
      const duplicateLog = logs.find((log) => log.operation_type === "payment_canceled_duplicate");
      expect(duplicateLog).toBeDefined();
    });
  });

  describe("無料イベントのキャンセル", () => {
    let freeEvent: TestPaymentEvent;

    beforeAll(async () => {
      // 無料テストイベント作成
      freeEvent = await createPaidTestEvent(testUser.id, {
        title: "無料キャンセルテストイベント",
        fee: 0,
      });
    });

    afterAll(async () => {
      await adminClient.from("attendances").delete().eq("event_id", freeEvent.id);
      await adminClient.from("events").delete().eq("id", freeEvent.id);
    });

    test("無料イベント: 参加キャンセル時に決済レコードは作成されない", async () => {
      // Arrange
      const attendance = await createTestAttendance(freeEvent.id, {
        email: `free-participant-${Date.now()}@example.com`,
        nickname: `無料参加者-${Date.now()}`,
        status: "attending",
      });

      // Act
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 0,
      });

      // Assert
      expect(error).toBeNull();

      // 決済レコードが存在しないことを確認
      const { data: payments } = await adminClient
        .from("payments")
        .select("*")
        .eq("attendance_id", attendance.id);

      expect(payments).toEqual([]);
    });
  });

  describe("参加再登録（canceled → pending）", () => {
    test("canceled から再参加すると新しい pending レコードが作成される", async () => {
      // Arrange: 一度キャンセルした参加者
      const attendance = await createLocalTestAttendance("not_attending");
      const canceledPayment = await createTestPayment(attendance.id, "canceled");

      // Act: 再度参加に変更
      const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: attendance.id,
        p_status: "attending",
        p_payment_method: "cash",
        p_event_fee: 1000,
      });

      // Assert
      expect(error).toBeNull();

      // 新しい pending レコードが作成され、canceled レコードは維持されることを確認
      const { data: payments } = await adminClient
        .from("payments")
        .select("*")
        .eq("attendance_id", attendance.id)
        .order("created_at", { ascending: false });

      expect(payments).toHaveLength(2);

      // 最新のレコードが pending であることを確認
      expect(payments[0].status).toBe("pending");
      expect(payments[0].method).toBe("cash");
      expect(payments[0].amount).toBe(1000);

      // 古い canceled レコードが維持されていることを確認
      expect(payments[1].id).toBe(canceledPayment.id);
      expect(payments[1].status).toBe("canceled");
    });
  });
});
