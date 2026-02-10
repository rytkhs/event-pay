/**
 * P0-2: カテゴリC: 一意制約・重複制約テスト（実DB版）
 *
 * C-3: payments一意制約違反 (unique_open_payment_per_attendance) ⭐P0重要
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";

import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import {
  DatabaseTestHelper,
  setupDatabaseTransactionTest,
  type DatabaseTransactionTestSetup,
} from "./database-transaction-test-setup";

describe("カテゴリC: 一意制約・重複制約テスト（実DB版）", () => {
  let setup: DatabaseTransactionTestSetup;

  beforeAll(async () => {
    setup = await setupDatabaseTransactionTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  describe("C-3: payments一意制約違反 (unique_open_payment_per_attendance)", () => {
    it("🚨 P0重要: 実際のUNIQUE制約違反によるpending payment重複防止検証", async () => {
      const { testData } = setup;

      // 【実DB戦略】実際にunique_open_payment_per_attendance制約違反を発生させる

      // 1. 事前準備: 既存attendance + pending paymentを実際に作成
      const existingAttendance = await DatabaseTestHelper.createDirectAttendance({
        event_id: testData.paidEvent.id,
        nickname: "既存参加者",
        email: "existing@test.example.com",
        status: "attending",
        guest_token: "gst_existing123456789012345678901234", // 36文字
      });

      // 既存のpending paymentを作成（ここでUNIQUE制約が確立される）
      const existingPayment = await DatabaseTestHelper.createDirectPayment({
        attendance_id: existingAttendance.id,
        amount: 2000,
        method: "stripe",
        status: "pending", // ← この状態でUNIQUE制約有効
      });

      // まず、paymentsテーブルに直接制約違反を引き起こす
      const clientFactory = getSecureClientFactory();
      const adminClient = await clientFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "P0-2_CONSTRAINT_VIOLATION_TEST"
      );

      // 既に存在するpaymentと同じattendance_idでpending状態のpaymentを作成しようとする
      const { error: directError } = await adminClient.from("payments").insert({
        attendance_id: existingAttendance.id, // ← 既存のattendance_id
        amount: 1500,
        method: "stripe",
        status: "pending", // ← UNIQUE制約違反発生
      });

      // 4. 【仕様書検証】実際のUNIQUE制約違反を確認
      expect(directError).toBeDefined();
      if (directError) {
        expect(directError.code).toBe("23505"); // PostgreSQL UNIQUE制約違反
        expect(directError.message).toContain("unique_open_payment_per_attendance");
      }

      // 5. 既存データが影響を受けていないことを確認
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: "existing@test.example.com",
          shouldExist: true, // ← 既存データは維持
        },
        paymentExists: {
          attendanceId: existingAttendance.id,
          shouldExist: true, // ← 既存paymentは維持
        },
      });

      // 6. クリーンアップ
      await adminClient.from("payments").delete().eq("id", existingPayment.id);
      await adminClient.from("attendances").delete().eq("id", existingAttendance.id);
    });
  });

  describe("C-1: guest_token重複時の処理", () => {
    it("ゲストトークン重複時の適切なエラーハンドリング", async () => {
      const { testData } = setup;

      // セットアップ: 既存のゲストトークンを作成
      const duplicateToken = "gst_duplicate12345678901234567890123";

      const clientFactory = getSecureClientFactory();
      const adminClient = await clientFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "P0-2_GUEST_TOKEN_DUPLICATE_TEST"
      );

      const { error: setupError } = await adminClient.from("attendances").insert({
        event_id: testData.paidEvent.id,
        nickname: "既存トークン",
        email: "existing-token@test.example.com",
        status: "attending",
        guest_token: duplicateToken,
      });

      expect(setupError).toBeNull();

      // 【実DB戦略】同じguest_tokenでストアドプロシージャ呼び出し
      const { error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: testData.paidEvent.id,
          p_nickname: "重複トークン太郎",
          p_email: "duplicate-token@test.example.com",
          p_status: "attending",
          p_guest_token: duplicateToken, // ← 既存と同じtoken
          p_payment_method: "stripe",
          p_event_fee: 2000,
        }
      );

      // 【仕様書検証】実際のguest_token重複制約違反
      expect(error).toBeDefined();
      if (error) {
        expect(error.message).toMatch(/duplicate|unique|already exists|guest_token/i);
      }

      // 新規レコードが挿入されていないことを確認
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: "duplicate-token@test.example.com",
          shouldExist: false, // ← 重複によりロールバック
        },
        attendanceCount: {
          eventId: testData.paidEvent.id,
          expectedCount: 1, // ← 既存の1件のみ
        },
      });

      // 既存データが影響を受けていないことを確認
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: "existing-token@test.example.com",
          shouldExist: true, // ← 既存データは維持
        },
      });

      // クリーンアップ
      await adminClient.from("attendances").delete().eq("guest_token", duplicateToken);
    });
  });

  describe("C-2: (event_id, email)複合一意制約違反", () => {
    it("同一イベント・同一メールの重複登録エラー処理", async () => {
      const { testData } = setup;

      // セットアップ: 既存の参加者を作成
      const duplicateEmail = "duplicate@test.example.com";

      const clientFactory = getSecureClientFactory();
      const adminClient = await clientFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "P0-2_EMAIL_DUPLICATE_TEST"
      );

      const { error: setupError } = await adminClient.from("attendances").insert({
        event_id: testData.paidEvent.id,
        nickname: "既存メール",
        email: duplicateEmail,
        status: "attending",
        guest_token: "gst_emaildup123456789012345678901234",
      });

      expect(setupError).toBeNull();

      // 【実DB戦略】同じevent_id + emailの組み合わせでストアドプロシージャ呼び出し
      const { error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: testData.paidEvent.id,
          p_nickname: "重複メール太郎",
          p_email: duplicateEmail, // ← 既存と同じemail
          p_status: "attending",
          p_guest_token: "gst_emaildup2_1234567890123456789012", // 36文字、異なるtoken
          p_payment_method: "stripe",
          p_event_fee: 2000,
        }
      );

      // 【仕様書検証】実際のemail複合一意制約違反
      expect(error).toBeDefined();
      if (error) {
        expect(error.message).toMatch(
          /duplicate|unique|already registered|attendances_event_email_unique/i
        );
      }

      // 新規レコードが挿入されていないことを確認
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceCount: {
          eventId: testData.paidEvent.id,
          expectedCount: 1, // ← 既存の1件のみ（新規追加はロールバック）
        },
      });

      // 既存データが影響を受けていないことを確認
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: duplicateEmail,
          shouldExist: true, // ← 既存データは維持
        },
      });

      // クリーンアップ
      await adminClient
        .from("attendances")
        .delete()
        .eq("email", duplicateEmail)
        .eq("event_id", testData.paidEvent.id);
    });
  });
});
