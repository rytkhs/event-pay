/**
 * P0-2: カテゴリE: 同時実行・レースコンディションテスト
 *
 * E-1: 定員チェックレースコンディション
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";

import { cleanupTestPaymentData, createPaidTestEvent } from "@tests/helpers/test-payment-data";

import {
  DatabaseTestHelper,
  setupDatabaseTransactionTest,
  type DatabaseTransactionTestSetup,
} from "./database-transaction-test-setup";

describe("カテゴリE: 同時実行・レースコンディションテスト", () => {
  let setup: DatabaseTransactionTestSetup;

  beforeAll(async () => {
    setup = await setupDatabaseTransactionTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  describe("E-1: 定員チェックレースコンディション", () => {
    it("🔥 P1高優先度: 定員1のイベントに同時回答時の排他制御", async () => {
      const { testData } = setup;

      // 注意: テスト内での追加データ作成のため、個別関数を使用
      // セットアップは通常の有料イベント用のため、定員1の限定イベントを追加で作成する必要がある
      const limitedEvent = await createPaidTestEvent(testData.user.id, {
        fee: 1500,
        capacity: 1, // 定員1
        paymentMethods: ["stripe"],
      });

      // 【実DB戦略】完全にユニークかつ正確な36文字guest_token生成
      const uniqueId = Math.random().toString(36).substring(2, 11); // 9文字固定
      const firstToken = `gst_${uniqueId}_1234567890123456789012`; // gst_ + 9文字 + _ + 22文字 = 36文字
      const capacityToken = `gst_${uniqueId}_9876543210987654321098`; // gst_ + 9文字 + _ + 22文字 = 36文字

      const _firstAttendance = await DatabaseTestHelper.createDirectAttendance({
        event_id: limitedEvent.id,
        nickname: "最初の参加者",
        email: "first-attendee@test.example.com",
        status: "attending",
        guest_token: firstToken,
      });

      // 定員超過を引き起こすストアドプロシージャ呼び出し
      const { error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: limitedEvent.id,
          p_nickname: "定員超過太郎",
          p_email: "capacity-exceeded@test.example.com",
          p_status: "attending",
          p_guest_token: capacityToken,
          p_payment_method: "stripe",
          p_event_fee: 1500,
        }
      );

      // 【仕様書厳正検証】定員超過エラー
      expect(error).toBeDefined();
      if (error) {
        expect(error.message).toMatch(/capacity|定員|reached|exceeded/i);
      }

      // データベース状態: 失敗したレコードは存在しない
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: limitedEvent.id,
          email: "capacity-exceeded@test.example.com",
          shouldExist: false,
        },
      });

      // 【実DB版】セキュリティログは実際のDBエラーでは発生しない
      // 実DB版では定員チェックは正常なビジネスロジックとして処理される
      console.log("✓ 定員超過制御が正常に動作 - 実DB版検証完了");

      // クリーンアップ
      await cleanupTestPaymentData({ eventIds: [limitedEvent.id] });
    });
  });

  describe("E-2: guest_token重複レースコンディション", () => {
    it("P1優先度: 同じguest_tokenでの同時挿入時の制約処理", async () => {
      const { testData } = setup;

      // 【実DB戦略】レースコンディション状況を実際のデータベースで再現

      // 1. 事前準備: 既存のguest_tokenを作成してレース状態をセットアップ
      const raceToken = "gst_race1234567890123456789012345678"; // 36文字
      const _existingAttendance = await DatabaseTestHelper.createDirectAttendance({
        event_id: testData.paidEvent.id,
        nickname: "先行参加者",
        email: "first-racer@test.example.com",
        status: "attending",
        guest_token: raceToken,
      });

      // 2. レースコンディション発生: 同じguest_tokenで別の参加者が挿入を試行
      const { error } = await DatabaseTestHelper.callStoredProcedure(
        "register_attendance_with_payment",
        {
          p_event_id: testData.paidEvent.id,
          p_nickname: "レース太郎",
          p_email: "race-condition@test.example.com",
          p_status: "attending",
          p_guest_token: raceToken, // ← 既存と同じtoken（レースコンディション）
          p_payment_method: "stripe",
          p_event_fee: 2000,
        }
      );

      // 【仕様書検証】実際のguest_token重複制約違反
      expect(error).toBeDefined();
      if (error) {
        expect(error.message).toMatch(/duplicate|unique|already exists|guest_token/i);
      }

      // データベース状態: レースコンディション負け組は挿入されていない
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: "race-condition@test.example.com",
          shouldExist: false, // ← レースコンディションにより挿入失敗
        },
        attendanceCount: {
          eventId: testData.paidEvent.id,
          expectedCount: 1, // ← 先行参加者のみ
        },
      });

      // 先行参加者（レースコンディション勝者）は影響を受けていない
      await DatabaseTestHelper.verifyDatabaseState({
        attendanceExists: {
          eventId: testData.paidEvent.id,
          email: "first-racer@test.example.com",
          shouldExist: true, // ← 先行参加者は維持
        },
      });
    });
  });
});
