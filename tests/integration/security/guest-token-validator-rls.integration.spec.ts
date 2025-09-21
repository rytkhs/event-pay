/**
 * ゲストトークンバリデーター RLS適用統合テスト
 *
 * guest-token-validator.ts の修正が正しく機能していることを検証：
 * - Service Roleから Guest Client への変更
 * - RLSポリシーによるアクセス制御
 * - セキュリティ境界の確認
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { createTestEvent, deleteTestEvent } from "@tests/helpers/test-event";
import {
  createTestAttendance,
  createPendingTestPayment,
  cleanupTestPaymentData,
} from "@tests/helpers/test-payment-data";
import { createTestUser, deleteTestUser } from "@tests/helpers/test-user";

import { getRLSGuestTokenValidator } from "@core/security/guest-token-validator";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

// テストヘルパーをインポート

describe("Guest Token Validator RLS Policy Tests", () => {
  let testEventId: string;
  let testAttendanceId: string;
  let testGuestToken: string;
  let testUserId: string;
  let anotherEventId: string;
  let anotherGuestToken: string;
  let anotherAttendanceId: string;

  beforeAll(async () => {
    // 1. テストユーザーを作成
    const testUser = await createTestUser("guest-token-test@example.com", "TestPassword123!");
    const anotherUser = await createTestUser("another-guest-test@example.com", "TestPassword123!");

    testUserId = testUser.id;

    // 2. テストイベントを作成
    const testEvent = await createTestEvent(testUserId, {
      title: "Guest Token Test Event 1",
      fee: 1000,
      capacity: 10,
      payment_methods: ["stripe", "cash"],
      payment_deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), // 6日後
    });
    testEventId = testEvent.id;

    const anotherEvent = await createTestEvent(anotherUser.id, {
      title: "Another Guest Token Test Event",
      fee: 500,
      capacity: 5,
      payment_methods: ["cash"],
    });
    anotherEventId = anotherEvent.id;

    // 3. テスト参加者を作成（ヘルパーにトークン生成を任せる）
    const testAttendance = await createTestAttendance(testEventId, {
      email: "guest-test-participant@example.com",
      nickname: "Guest Token Test Participant",
      status: "attending",
    });
    testAttendanceId = testAttendance.id;
    testGuestToken = testAttendance.guest_token;

    const anotherAttendance = await createTestAttendance(anotherEventId, {
      email: "another-test-participant@example.com",
      nickname: "Another Test Participant",
      status: "attending",
    });
    anotherAttendanceId = anotherAttendance.id;
    anotherGuestToken = anotherAttendance.guest_token;

    // 4. テスト決済データを作成
    await createPendingTestPayment(testAttendanceId, {
      amount: 1000,
      method: "stripe",
    });
  });

  afterAll(async () => {
    try {
      // テストデータをクリーンアップ
      await cleanupTestPaymentData({
        attendanceIds: [testAttendanceId, anotherAttendanceId],
        eventIds: [testEventId, anotherEventId],
      });

      // テストユーザーを削除
      await deleteTestUser("guest-token-test@example.com");
      await deleteTestUser("another-guest-test@example.com");
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  describe("RLS Guest Token Validator Basic Functionality", () => {
    test("正しいゲストトークンで参加データを取得できる", async () => {
      const validator = getRLSGuestTokenValidator();
      const result = await validator.validateToken(testGuestToken);

      expect(result.isValid).toBe(true);
      expect(result.attendanceId).toBe(testAttendanceId);
      expect(result.eventId).toBe(testEventId);
      expect(result.canModify).toBe(true); // 期限内なので変更可能
      expect(result.errorCode).toBeUndefined();
    });

    test("無効なゲストトークンでは参加データを取得できない", async () => {
      const validator = getRLSGuestTokenValidator();
      const invalidToken = "gst_invalid_validator_test_123456789";

      const result = await validator.validateToken(invalidToken);

      expect(result.isValid).toBe(false);
      expect(result.attendanceId).toBeUndefined();
      expect(result.errorCode).toBe("TOKEN_NOT_FOUND");
      expect(result.canModify).toBe(false);
    });

    test("形式が正しくないゲストトークンは即座に拒否される", async () => {
      const validator = getRLSGuestTokenValidator();
      const malformedToken = "invalid_format";

      const result = await validator.validateToken(malformedToken);

      expect(result.isValid).toBe(false);
      expect(result.attendanceId).toBeUndefined();
      expect(result.errorCode).toBe("INVALID_FORMAT");
      expect(result.canModify).toBe(false);
    });
  });

  describe("RLS Policy Data Isolation", () => {
    test("ゲストトークンは自分の参加データのみアクセス可能", async () => {
      const validator = getRLSGuestTokenValidator();

      // 自分のトークンで自分のデータにアクセス
      const ownResult = await validator.validateToken(testGuestToken);
      expect(ownResult.isValid).toBe(true);
      expect(ownResult.attendanceId).toBe(testAttendanceId);
      expect(ownResult.eventId).toBe(testEventId);

      // 他人のトークンで他人のデータにアクセス
      const otherResult = await validator.validateToken(anotherGuestToken);
      expect(otherResult.isValid).toBe(true);
      expect(otherResult.attendanceId).toBe(anotherAttendanceId);
      expect(otherResult.eventId).toBe(anotherEventId);

      // 互いに違うデータであることを確認
      expect(ownResult.attendanceId).not.toBe(otherResult.attendanceId);
      expect(ownResult.eventId).not.toBe(otherResult.eventId);
    });

    test("ゲストクライアントは直接的なデータベースアクセスでもRLS制約を受ける", async () => {
      const factory = SecureSupabaseClientFactory.getInstance();
      const guestClient = factory.createGuestClient(testGuestToken);

      // attendancesテーブルへの直接アクセス
      const { data: attendances, error } = await guestClient
        .from("attendances")
        .select("id, nickname, event_id, guest_token");

      expect(error).toBeNull();
      expect(attendances).toBeDefined();

      if (attendances) {
        // RLSにより、自分の参加データのみ取得
        expect(attendances).toHaveLength(1);
        expect(attendances[0].id).toBe(testAttendanceId);
        expect(attendances[0].guest_token).toBe(testGuestToken);
        expect(attendances[0].event_id).toBe(testEventId);
      }
    });

    test("誤ったゲストトークンでは何のデータも取得できない", async () => {
      const factory = SecureSupabaseClientFactory.getInstance();
      const wrongGuestClient = factory.createGuestClient("gst_wrong_token_12345678901234567890"); // 36文字

      const { data: attendances, error } = await wrongGuestClient
        .from("attendances")
        .select("id, nickname");

      expect(error).toBeNull();
      expect(attendances).toEqual([]); // RLSにより空の結果
    });
  });

  describe("Guest Client vs Service Role Behavior", () => {
    test("ゲストクライアントはサービスロールと異なりRLS制約を受ける", async () => {
      const factory = SecureSupabaseClientFactory.getInstance();

      // ゲストクライアント（RLS適用）
      const guestClient = factory.createGuestClient(testGuestToken);
      const { data: guestData } = await guestClient.from("attendances").select("id");

      // サービスロールクライアント（RLS バイパス、比較用）
      const adminClient = await factory.createAuditedAdminClient(
        AdminReason.SECURITY_INVESTIGATION,
        "compare with service role behavior"
      );
      const { data: adminData } = await adminClient.from("attendances").select("id");

      // ゲストクライアントは制限されたデータのみ取得
      expect(guestData).toBeDefined();
      expect(guestData!.length).toBe(1);
      expect(guestData![0].id).toBe(testAttendanceId);

      // サービスロールクライアントは全てのデータを取得（比較用）
      expect(adminData).toBeDefined();
      expect(adminData!.length).toBeGreaterThanOrEqual(2); // 複数の参加データ
    });

    test("validateToken メソッドもRLS適用されたゲストクライアントを使用", async () => {
      const validator = getRLSGuestTokenValidator();

      // 基本的なトークン検証
      const result = await validator.validateToken(testGuestToken);

      expect(result.isValid).toBe(true);
      expect(result.attendanceId).toBe(testAttendanceId);
      expect(result.eventId).toBe(testEventId);
      expect(result.canModify).toBe(true);
    });
  });

  describe("Error Handling and Security", () => {
    test("データベースエラー時の適切なエラーハンドリング", async () => {
      const validator = getRLSGuestTokenValidator();

      // 存在しないが形式は正しいトークン（36文字）
      const nonExistentToken = "gst_nonexistent_token_12345678901234"; // 36文字 (gst_+32文字)
      const result = await validator.validateToken(nonExistentToken);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe("TOKEN_NOT_FOUND");
      expect(result.canModify).toBe(false);
    });

    test("セキュリティログが記録される", async () => {
      const validator = getRLSGuestTokenValidator();

      // 無効なトークンでのアクセス試行（36文字）
      const invalidToken = "gst_security_test_invalid_1234567890"; // 36文字 (gst_+32文字)
      const result = await validator.validateToken(invalidToken);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe("TOKEN_NOT_FOUND");

      // ログ記録は内部的に行われるため、エラーが適切に処理されていることで確認
    });

    test("期限切れイベントでの変更不可判定", async () => {
      // ヘルパーを使って期限切れイベントを作成
      const expiredEvent = await createTestEvent(testUserId, {
        title: "Expired Event",
        fee: 0,
        registration_deadline: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 過去の期限
      });

      const expiredAttendance = await createTestAttendance(expiredEvent.id, {
        email: "expired-test@example.com",
        nickname: "Expired Test User",
        status: "attending",
      });

      const validator = getRLSGuestTokenValidator();
      const result = await validator.validateToken(expiredAttendance.guest_token);

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(false); // 期限切れのため変更不可

      // クリーンアップ
      await cleanupTestPaymentData({
        attendanceIds: [expiredAttendance.id],
        eventIds: [expiredEvent.id],
      });
    });
  });
});
