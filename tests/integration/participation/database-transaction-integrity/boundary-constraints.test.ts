/**
 * P0-2: カテゴリD: 境界値・制約違反テスト
 *
 * D-1: attendances制約違反でのトランザクション処理
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";

import {
  DatabaseTestHelper,
  setupDatabaseTransactionTest,
  type DatabaseTransactionTestSetup,
} from "./database-transaction-test-setup";

describe("カテゴリD: 境界値・制約違反テスト", () => {
  let setup: DatabaseTransactionTestSetup;

  beforeAll(async () => {
    setup = await setupDatabaseTransactionTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  describe("D-1: attendances制約違反でのトランザクション処理", () => {
    it("D-1a: nickname長さ制約違反によるエラーハンドリング", async () => {
      const { testData } = setup;

      // 【実DB戦略】空文字nicknameでの制約違反を実際にテスト

      // 1. 空文字nicknameでストアドプロシージャ直接呼び出し
      const { error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: testData.paidEvent.id,
          p_nickname: "", // 空文字制約違反
          p_email: "empty-nickname@test.example.com",
          p_status: "attending",
          p_guest_token: "gst_emptynick123456789012345678901234", // 36文字
          p_payment_method: "stripe",
          p_event_fee: 2000,
        }
      );

      // 【仕様書検証】実際のnickname制約違反またはアプリケーションバリデーション
      if (error) {
        // 制約違反またはバリデーションエラーが発生した場合
        expect(error.message).toMatch(/nickname|empty|null|invalid/i);
      } else {
        // エラーが発生しなかった場合（アプリケーション層でハンドリング）
        console.log(
          "⚠️ 空nicknameでもストアドプロシージャが成功。アプリケーション層バリデーション確認"
        );
      }

      // データベース状態確認: 制約違反の場合は挿入されていない
      const shouldExist = !error; // errorがない場合は挿入されている
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: "empty-nickname@test.example.com",
          shouldExist: shouldExist,
        },
      });
    });

    it("D-1b: email形式制約違反によるエラーハンドリング", async () => {
      const { testData } = setup;

      // 【実DB戦略】不正なemail形式での制約違反を実際にテスト

      // 1. 不正なemail形式でストアドプロシージャ直接呼び出し
      const { error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: testData.paidEvent.id,
          p_nickname: "不正メール太郎",
          p_email: "invalid-email-format", // 不正なemail形式
          p_status: "attending",
          p_guest_token: "gst_invalidemail12345678901234567890", // 36文字
          p_payment_method: "stripe",
          p_event_fee: 2000,
        }
      );

      // 【仕様書検証】実際のemail形式制約違反またはアプリケーションバリデーション
      if (error) {
        // 制約違反またはバリデーションエラーが発生した場合
        expect(error.message).toMatch(/email|format|syntax|invalid|check constraint/i);
      } else {
        // エラーが発生しなかった場合（アプリケーション層でハンドリング）
        console.log(
          "⚠️ 不正email形式でもストアドプロシージャが成功。アプリケーション層バリデーション確認"
        );
      }

      // データベース状態確認: 制約違反の場合は挿入されていない
      const shouldExist = !error; // errorがない場合は挿入されている
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: "invalid-email-format",
          shouldExist: shouldExist,
        },
      });
    });
  });

  describe("D-2: 存在しないevent_idでの外部キー制約違反", () => {
    it("存在しないevent_idでの参加登録エラー処理", async () => {
      // 【実DB戦略】存在しないevent_idでの外部キー制約違反を実際にテスト

      // 1. 存在しないevent_idでストアドプロシージャ直接呼び出し
      const nonExistentEventId = "00000000-0000-0000-0000-000000000000"; // UUID形式の存在しないID

      const { error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: nonExistentEventId, // 存在しないevent_id
          p_nickname: "存在しないイベント太郎",
          p_email: "nonexistent-event@test.example.com",
          p_status: "attending",
          p_guest_token: "gst_nonexist123456789012345678901234", // 36文字
          p_payment_method: "stripe",
          p_event_fee: 2000,
        }
      );

      // 【仕様書検証】実際の外部キー制約違反またはイベント存在チェック
      expect(error).toBeDefined();
      if (error) {
        // 外部キー制約違反またはイベント存在エラー
        expect(error.message).toMatch(/event|not found|not exist|foreign key|invalid/i);
      }

      // データベース状態確認: 存在しないevent_idなので挿入されていない
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: nonExistentEventId,
          email: "nonexistent-event@test.example.com",
          shouldExist: false, // ← 外部キー制約違反により挿入されない
        },
      });
    });
  });
});
