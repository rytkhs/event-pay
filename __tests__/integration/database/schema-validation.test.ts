/**
 * データベーススキーマ検証統合テスト
 * EventPay データベーススキーマの整合性と制約を検証
 * 実際のSupabaseローカル環境を使用
 */

import { TestDataManager } from "@/test-utils/test-data-manager";

describe("データベーススキーマ検証", () => {
  let supabase: any;
  let testDataManager: TestDataManager;

  beforeAll(async () => {
    // 実際のSupabaseクライアントを使用
    supabase = (global as any).createSupabaseClient();
    testDataManager = new TestDataManager(supabase);
  });

  afterEach(async () => {
    // 各テスト後にデータをクリーンアップ
    await testDataManager.cleanup();
  });

  describe("テーブル構造検証", () => {
    test("eventsテーブルのスキーマが正しく定義されている", async () => {
      // テーブルの存在確認とスキーマ検証
      const { data: tableExists, error } = await supabase.from("events").select("id").limit(1);

      expect(error).toBeNull();
      expect(tableExists).toBeDefined();
      expect(Array.isArray(tableExists)).toBe(true);
    });

    test("attendancesテーブルのスキーマが正しく定義されている", async () => {
      const { data: tableExists, error } = await supabase.from("attendances").select("id").limit(1);

      expect(error).toBeNull();
      expect(tableExists).toBeDefined();
      expect(Array.isArray(tableExists)).toBe(true);
    });

    test("paymentsテーブルのスキーマが正しく定義されている", async () => {
      const { data: tableExists, error } = await supabase.from("payments").select("id").limit(1);

      expect(error).toBeNull();
      expect(tableExists).toBeDefined();
      expect(Array.isArray(tableExists)).toBe(true);
    });

    test("usersテーブルのスキーマが正しく定義されている", async () => {
      const { data: tableExists, error } = await supabase.from("users").select("id").limit(1);

      expect(error).toBeNull();
      expect(tableExists).toBeDefined();
      expect(Array.isArray(tableExists)).toBe(true);
    });
  });

  describe("ENUM型検証", () => {
    test("event_status_enumが正しく定義されている", async () => {
      const { creator } = await testDataManager.setupEventWithAttendees({}, 1);

      for (const status of ["upcoming", "ongoing", "past", "cancelled"]) {
        const event = await testDataManager.createTestEvent(
          {
            title: `テストイベント ${status}`,
            status: status as any,
          },
          creator.id
        );

        expect(event).toBeDefined();
        expect(event.status).toBe(status);
      }
    });

    test("payment_status_enumが正しく定義されている", async () => {
      const { attendances } = await testDataManager.setupEventWithAttendees({}, 7); // 7人の参加者を作成

      const statuses = ["pending", "paid", "failed", "received", "completed", "refunded", "waived"];

      for (let i = 0; i < statuses.length; i++) {
        const status = statuses[i];
        const payment = await testDataManager.createTestPayment({
          attendance_id: attendances[i].id, // 各paymentに異なるattendanceを使用
          status: status as any,
        });

        expect(payment).toBeDefined();
        expect(payment.status).toBe(status);
      }
    });

    test("attendance_status_enumが正しく定義されている", async () => {
      const { event } = await testDataManager.setupEventWithAttendees({}, 1);

      for (const status of ["attending", "not_attending", "maybe"]) {
        const attendance = await testDataManager.createTestAttendance({
          event_id: event.id,
          nickname: `テスト参加者_${status}`,
          email: `test-${status}@example.com`,
          status: status as any,
        });

        expect(attendance).toBeDefined();
        expect(attendance.status).toBe(status);
      }
    });
  });

  describe("制約検証", () => {
    test("イベントの参加費は0以上である", async () => {
      const creator = await testDataManager.createTestUser();

      // 正常な参加費でのテスト
      const validEvent = await testDataManager.createTestEvent(
        {
          title: "有料イベント",
          fee: 1000,
        },
        creator.id
      );

      expect(validEvent).toBeDefined();
      expect(validEvent.fee).toBe(1000);

      // 0円でのテスト
      const freeEvent = await testDataManager.createTestEvent(
        {
          title: "無料イベント",
          fee: 0,
        },
        creator.id
      );

      expect(freeEvent).toBeDefined();
      expect(freeEvent.fee).toBe(0);

      // 負の値でのテスト（エラーが発生することを確認）
      await expect(
        testDataManager.createTestEvent(
          {
            title: "無効イベント",
            fee: -100,
          },
          creator.id
        )
      ).rejects.toThrow();
    });

    test("イベントの定員は1以上である", async () => {
      const creator = await testDataManager.createTestUser();

      // 正常な定員でのテスト
      const event = await testDataManager.createTestEvent(
        {
          title: "定員テストイベント",
          capacity: 50,
        },
        creator.id
      );

      expect(event).toBeDefined();
      expect(event.capacity).toBe(50);

      // 0以下の定員でのテスト（エラーが発生することを確認）
      await expect(
        testDataManager.createTestEvent(
          {
            title: "無効定員イベント",
            capacity: 0,
          },
          creator.id
        )
      ).rejects.toThrow();
    });

    test("決済締切は参加締切以降である", async () => {
      const creator = await testDataManager.createTestUser();

      // 正常な締切設定でのテスト
      const event = await testDataManager.createTestEvent(
        {
          title: "締切テストイベント",
          registration_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          payment_deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        },
        creator.id
      );

      expect(event).toBeDefined();
      expect(new Date(event.payment_deadline).getTime()).toBeGreaterThanOrEqual(
        new Date(event.registration_deadline).getTime()
      );

      // 無効な締切設定でのテスト（エラーが発生することを確認）
      await expect(
        testDataManager.createTestEvent(
          {
            title: "無効締切イベント",
            registration_deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
            payment_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          },
          creator.id
        )
      ).rejects.toThrow();
    });
  });

  describe("外部キー制約検証", () => {
    test("attendancesテーブルのevent_id外部キー制約", async () => {
      const { event } = await testDataManager.setupEventWithAttendees({}, 1);

      const attendance = await testDataManager.createTestAttendance({
        event_id: event.id,
        nickname: "外部キーテスト参加者",
        email: "fk-test@example.com",
        status: "attending",
      });

      expect(attendance).toBeDefined();
      expect(attendance.event_id).toBe(event.id);
    });

    test("paymentsテーブルのattendance_id外部キー制約", async () => {
      const { attendances } = await testDataManager.setupEventWithAttendees({}, 1);

      // 正常な外部キー参照でのテスト
      const payment = await testDataManager.createTestPayment({
        attendance_id: attendances[0].id,
        method: "stripe",
        amount: 1000,
      });

      expect(payment).toBeDefined();
      expect(payment.attendance_id).toBe(attendances[0].id);

      // 無効な外部キー参照でのテスト（エラーが発生することを確認）
      const invalidAttendanceId = "00000000-0000-0000-0000-000000000000";
      await expect(
        testDataManager.createTestPayment({
          attendance_id: invalidAttendanceId,
          method: "stripe",
          amount: 1000,
        })
      ).rejects.toThrow();
    });
  });

  describe("インデックス検証", () => {
    test("eventsテーブルのcreated_by（creator_id）インデックスが効率的に動作する", async () => {
      const { creator } = await testDataManager.setupEventWithAttendees({}, 1);

      const { data, error } = await supabase
        .from("events")
        .select("id, title")
        .eq("created_by", creator.id)
        .limit(10);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    });

    test("attendancesテーブルのevent_idインデックスが効率的に動作する", async () => {
      const { event } = await testDataManager.setupEventWithAttendees({}, 3);

      const { data, error } = await supabase
        .from("attendances")
        .select("id, status")
        .eq("event_id", event.id)
        .limit(10);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(3);
    });
  });
});
