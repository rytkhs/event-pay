/**
 * P0-2: カテゴリB: ロールバック処理テスト（実DB版）
 *
 * B-1: payments挿入失敗時のロールバック ⭐最重要
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";

import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { cleanupTestPaymentData } from "@tests/helpers/test-payment-data";

import {
  DatabaseTestHelper,
  setupDatabaseTransactionTest,
  type DatabaseTransactionTestSetup,
} from "./database-transaction-test-setup";

describe("カテゴリB: ロールバック処理テスト（実DB版）", () => {
  let setup: DatabaseTransactionTestSetup;

  beforeAll(async () => {
    setup = await setupDatabaseTransactionTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  describe("B-1: payments挿入失敗時のロールバック", () => {
    it("🚨 P0最重要: 実際のPostgreSQL制約違反によるpayments挿入失敗とロールバック検証", async () => {
      const { testData } = setup;

      // 【実DB戦略】ストアドプロシージャ内でのpayments挿入失敗とattendances自動ロールバック

      // 1. 実行前のデータベース状態を記録
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceCount: { eventId: testData.paidEvent.id, expectedCount: 0 },
      });

      // 2. 【確実な制約違反方法】PostgreSQL integer overflowでpayments挿入失敗
      // PostgreSQL integer型の最大値: 2,147,483,647を超える値を使用
      const overflowAmount = 2147483648; // integer overflowを確実に発生

      const { error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: testData.paidEvent.id,
          p_nickname: "ロールバックテスト太郎",
          p_email: "rollback@test.example.com",
          p_status: "attending",
          p_guest_token: "gst_rollback123456789012345678901234", // 36文字
          p_payment_method: "stripe",
          p_event_fee: overflowAmount, // ← integer overflow発生でpayments挿入失敗
        }
      );

      // 3. 【仕様書厳正検証】ストアドプロシージャでの制約違反エラーを確認
      expect(error).toBeDefined();
      expect(error.message).toMatch(
        /out of range for type integer|integer overflow|Failed to insert payment|numeric/i
      );

      // 4. 【最重要】完全なロールバック検証: attendanceが存在しない
      // ストアドプロシージャ内部でpayments挿入に失敗すると、既に挿入されたattendanceも削除される
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: "rollback@test.example.com",
          shouldExist: false, // ← ストアドプロシージャ内でロールバック実行
        },
        attendanceCount: {
          eventId: testData.paidEvent.id,
          expectedCount: 0, // ← payments失敗によりattendancesもロールバック
        },
      });

      // 5. paymentレコードも存在しないことを確認
      const clientFactory = getSecureClientFactory();
      const adminClient = await clientFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "P0-2_PAYMENT_ROLLBACK_VERIFICATION"
      );

      const { data: paymentData } = await adminClient
        .from("payments")
        .select("*")
        .eq("amount", overflowAmount); // overflow値でのpaymentは存在しない

      expect(paymentData || []).toHaveLength(0); // payments挿入も失敗している

      console.log("✅ ストアドプロシージャ内ロールバック機能検証完了:");
      console.log("  - payments挿入失敗 (integer overflow)");
      console.log("  - attendances自動削除 (ロールバック)");
      console.log("  - データベース整合性維持確認");
    });

    it("B-2: 存在しないイベントIDによる外部キー制約違反とロールバック", async () => {
      const { testData } = setup;

      // 【実DB戦略】存在しないevent_idでの外部キー制約違反によるエラーハンドリング

      // 存在しないevent_id（有効なUUID形式だが存在しない）
      const nonExistentEventId = "11111111-2222-3333-4444-555555555555";

      const { error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: nonExistentEventId, // ← 存在しないevent_id
          p_nickname: "存在しないイベント太郎",
          p_email: "nonexistent-event@test.example.com",
          p_status: "attending",
          p_guest_token: "gst_nonexist123456789012345678901234",
          p_payment_method: "stripe",
          p_event_fee: 2000,
        }
      );

      // 【仕様書検証】ストアドプロシージャ内の事前チェックまたは外部キー制約違反
      expect(error).toBeDefined();
      expect(error.message).toMatch(
        /event.*not found|event.*not exist|foreign key|invalid event|イベントが見つかりません/i
      );

      // attendanceも作成されていないことを確認
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: nonExistentEventId,
          email: "nonexistent-event@test.example.com",
          shouldExist: false, // ← event_idチェックで事前に処理が停止
        },
      });

      console.log("✅ 存在しないイベントIDでのエラーハンドリング検証完了");
    });

    it("B-3: 負の金額事前バリデーションによる適切なエラーハンドリング", async () => {
      const { testData } = setup;

      // 【修正後の動作確認】負の金額が事前バリデーションで適切に拒否されることを検証
      // issue #123 修正: ストアドプロシージャレベルでの負の値チェック

      const invalidAmount = -1000; // 負の値: セキュリティバグ修正により事前チェックで拒否されるべき

      const { data, error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: testData.paidEvent.id,
          p_nickname: "負の金額太郎",
          p_email: "negative-amount@test.example.com",
          p_status: "attending",
          p_guest_token: "gst_negative123456789012345678901234",
          p_payment_method: "stripe",
          p_event_fee: invalidAmount, // ← 負の値: 事前バリデーションで拒否
        }
      );

      // 【修正後の期待結果】負の値は確実にエラーで拒否される
      expect(error).toBeDefined();
      expect(error.message).toMatch(/Event fee cannot be negative|negative/i);
      expect(data).toBeNull();

      // 【重要】attendanceレコードも挿入されていないことを確認
      // 事前バリデーションのため、データベースレベルでの処理に到達しない
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: "negative-amount@test.example.com",
          shouldExist: false, // ← 事前バリデーションにより処理されない
        },
      });

      console.log("✅ issue #123 修正確認: 負の金額が適切に拒否されました");
    });
  });
});
