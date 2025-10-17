/**
 * 売上集計の回帰テスト: canceled/refunded ステータスの扱い
 *
 * 目的: update_revenue_summary 関数が canceled/refunded を正しく扱うことを検証
 * 設計書: docs/spec/add-canceled-status/design-v2.md
 *
 * テスト方針:
 * - 総売上: paid/received の全て（参加状態に関わらず）
 * - canceled を未収から除外
 * - refunded を売上・未収から除外
 */

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import {
  createTestAttendance,
  createPaidTestEvent,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "@/tests/helpers/test-payment-data";
import { testDataManager, createConnectTestData } from "@/tests/setup/test-data-seeds";

describe("売上集計: canceled/refunded の扱い（回帰テスト）", () => {
  let supabase: any;
  let testUser: any;
  let testEvent: TestPaymentEvent;

  beforeAll(async () => {
    // テストデータの準備
    const { activeUser } = await createConnectTestData();
    testUser = activeUser;
    testEvent = await createPaidTestEvent(activeUser.id, {
      title: `Revenue Summary Test Event ${Date.now()}`,
      fee: 1000,
    });

    // Supabaseクライアント取得
    const factory = SecureSupabaseClientFactory.getInstance();
    supabase = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "revenue summary test setup",
      {
        operationType: "SELECT",
        accessedTables: ["public.payments", "public.attendances", "public.events"],
        additionalInfo: { testContext: "revenue-summary-integration" },
      }
    );
  });

  afterAll(async () => {
    await testDataManager.cleanupTestData();
  });

  /**
   * テスト用の決済レコードを作成
   */
  async function createPayment(
    attendanceId: string,
    status: "pending" | "failed" | "paid" | "received" | "waived" | "canceled" | "refunded",
    amount: number
  ) {
    const paymentData: any = {
      attendance_id: attendanceId,
      method: status === "received" ? "cash" : "stripe",
      amount,
      status,
      tax_included: false,
    };

    // Stripeメソッドの場合は stripe_payment_intent_id を設定
    if (status !== "received") {
      paymentData.stripe_payment_intent_id = `pi_test_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      paymentData.stripe_account_id = testUser.stripeConnectAccountId;
    }

    if (status === "paid" || status === "refunded") {
      paymentData.paid_at = new Date().toISOString();
    }

    if (status === "received") {
      paymentData.paid_at = new Date().toISOString();
    }

    if (status === "refunded") {
      paymentData.refunded_amount = amount;
    }

    const { data, error } = await supabase
      .from("payments")
      .insert(paymentData)
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to create payment: ${error.message}`);
    }

    return data.id;
  }

  describe("会計原則に基づく売上集計", () => {
    it("総売上: paid/received の全てを計上（参加状態に関わらず）", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `Revenue Test 1 ${Date.now()}`,
        fee: 1000,
      });
      const attendance1 = await createTestAttendance(event.id); // attending
      const attendance2 = await createTestAttendance(event.id);

      // attendance2 を not_attending に変更
      await supabase
        .from("attendances")
        .update({ status: "not_attending" })
        .eq("id", attendance2.id);

      // 両方とも paid 状態で決済
      await createPayment(attendance1.id, "paid", 1000);
      await createPayment(attendance2.id, "paid", 1000);

      // 売上集計
      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      // 参加状態に関わらず、paid の全てが売上に計上される
      expect(revenue.total_revenue).toBe(2000);
      expect(revenue.paid_count).toBe(2);
    });

    it("未収集計: pending と failed のみ対象", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `Revenue Test 2 ${Date.now()}`,
        fee: 1000,
      });
      const attendance1 = await createTestAttendance(event.id);
      const attendance2 = await createTestAttendance(event.id);
      const attendance3 = await createTestAttendance(event.id);

      await createPayment(attendance1.id, "pending", 1000);
      await createPayment(attendance2.id, "failed", 1000);
      await createPayment(attendance3.id, "paid", 1000);

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      expect(revenue.pending_count).toBe(2); // pending + failed
      expect(revenue.total_revenue).toBe(1000); // paid のみ
    });
  });

  describe("canceled ステータスの扱い", () => {
    it("canceled は売上・未収いずれからも除外される", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `Canceled Test 1 ${Date.now()}`,
        fee: 1000,
      });
      const attendance1 = await createTestAttendance(event.id);
      const attendance2 = await createTestAttendance(event.id);
      const attendance3 = await createTestAttendance(event.id);
      const attendance4 = await createTestAttendance(event.id);

      await createPayment(attendance1.id, "pending", 1000);
      await createPayment(attendance2.id, "canceled", 1000); // キャンセル済み（未決済系）
      await createPayment(attendance3.id, "paid", 1000);
      await createPayment(attendance4.id, "received", 1000);

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      // canceled は売上に含まれない
      expect(revenue.total_revenue).toBe(2000); // paid + received
      expect(revenue.stripe_revenue).toBe(1000);
      expect(revenue.cash_revenue).toBe(1000);
      // canceled は未収にも含まれない
      expect(revenue.pending_count).toBe(1); // pending のみ
      expect(revenue.paid_count).toBe(2); // paid + received
    });

    it("多数の canceled が混在しても正しく除外される", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `Canceled Test 2 ${Date.now()}`,
        fee: 1000,
      });
      // pending 2件、canceled 5件、paid 3件
      const attendances = [];
      for (let i = 0; i < 10; i++) {
        const attendance = await createTestAttendance(event.id, {
          email: `test-participant-${Date.now()}-${i}@example.com`,
        });
        attendances.push(attendance);
      }

      await createPayment(attendances[0].id, "pending", 1000);
      await createPayment(attendances[1].id, "pending", 1000);
      await createPayment(attendances[2].id, "canceled", 1000);
      await createPayment(attendances[3].id, "canceled", 1000);
      await createPayment(attendances[4].id, "canceled", 1000);
      await createPayment(attendances[5].id, "canceled", 1000);
      await createPayment(attendances[6].id, "canceled", 1000);
      await createPayment(attendances[7].id, "paid", 1000);
      await createPayment(attendances[8].id, "paid", 1000);
      await createPayment(attendances[9].id, "paid", 1000);

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      expect(revenue.total_revenue).toBe(3000); // paid 3件のみ
      expect(revenue.pending_count).toBe(2); // pending 2件のみ
      expect(revenue.paid_count).toBe(3); // paid 3件のみ
    });
  });

  describe("refunded ステータスの扱い", () => {
    it("refunded は売上・未収いずれからも除外される", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `Refunded Test 1 ${Date.now()}`,
        fee: 1000,
      });
      const attendance1 = await createTestAttendance(event.id);
      const attendance2 = await createTestAttendance(event.id);
      const attendance3 = await createTestAttendance(event.id);
      const attendance4 = await createTestAttendance(event.id);

      await createPayment(attendance1.id, "pending", 1000);
      await createPayment(attendance2.id, "paid", 1000);
      await createPayment(attendance3.id, "received", 1000);
      await createPayment(attendance4.id, "refunded", 1000); // 返金済み

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      // refunded は売上に含まれない
      expect(revenue.total_revenue).toBe(2000); // paid + received
      // refunded は未収にも含まれない
      expect(revenue.pending_count).toBe(1); // pending のみ
      expect(revenue.paid_count).toBe(2); // paid + received
    });

    it("複数の refunded が混在しても正しく除外される", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `Refunded Test 2 ${Date.now()}`,
        fee: 1000,
      });
      const attendances = [];
      for (let i = 0; i < 6; i++) {
        const attendance = await createTestAttendance(event.id, {
          email: `test-participant-${Date.now()}-${i}@example.com`,
        });
        attendances.push(attendance);
      }

      await createPayment(attendances[0].id, "paid", 1000);
      await createPayment(attendances[1].id, "paid", 1000);
      await createPayment(attendances[2].id, "refunded", 1000);
      await createPayment(attendances[3].id, "refunded", 1000);
      await createPayment(attendances[4].id, "refunded", 1000);
      await createPayment(attendances[5].id, "received", 1000);

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      expect(revenue.total_revenue).toBe(3000); // paid 2件 + received 1件
      expect(revenue.paid_count).toBe(3);
    });
  });

  describe("全ステータス混在の総合テスト", () => {
    it("全ステータスが混在する場合も正しく集計される", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `Mixed Test ${Date.now()}`,
        fee: 1000,
      });
      const attendances = [];
      for (let i = 0; i < 8; i++) {
        const attendance = await createTestAttendance(event.id, {
          email: `test-participant-${Date.now()}-${i}@example.com`,
        });
        attendances.push(attendance);
      }

      // ステータスごとに1件ずつ + 追加で paid 1件
      await createPayment(attendances[0].id, "pending", 1000);
      await createPayment(attendances[1].id, "failed", 1000);
      await createPayment(attendances[2].id, "paid", 1000);
      await createPayment(attendances[3].id, "received", 1000);
      await createPayment(attendances[4].id, "waived", 1000);
      await createPayment(attendances[5].id, "canceled", 1000);
      await createPayment(attendances[6].id, "refunded", 1000);
      await createPayment(attendances[7].id, "paid", 1000);

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      // 売上: paid(2) + received(1) = 3000
      expect(revenue.total_revenue).toBe(3000);
      expect(revenue.stripe_revenue).toBe(2000);
      expect(revenue.cash_revenue).toBe(1000);
      expect(revenue.paid_count).toBe(3); // paid(2) + received(1)
      // 未収: pending(1) + failed(1) = 2
      expect(revenue.pending_count).toBe(2);
      // waived, canceled, refunded はいずれにも含まれない
    });
  });

  describe("エッジケース", () => {
    it("決済レコードが0件の場合も正常に処理される", async () => {
      const emptyEvent = await createPaidTestEvent(testUser.id, {
        title: `Empty Event ${Date.now()}`,
        fee: 1000,
      });

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: emptyEvent.id,
      });

      expect(error).toBeNull();
      expect(revenue.total_revenue).toBe(0);
      expect(revenue.paid_count).toBe(0);
      expect(revenue.pending_count).toBe(0);
    });

    it("全て canceled の場合、売上・未収ともに0になる", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `All Canceled Event ${Date.now()}`,
        fee: 1000,
      });

      const attendances = [];
      for (let i = 0; i < 5; i++) {
        const attendance = await createTestAttendance(event.id, {
          email: `test-participant-${Date.now()}-${i}@example.com`,
        });
        attendances.push(attendance);
      }

      for (const attendance of attendances) {
        await createPayment(attendance.id, "canceled", 1000);
      }

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      expect(revenue.total_revenue).toBe(0);
      expect(revenue.paid_count).toBe(0);
      expect(revenue.pending_count).toBe(0);
    });

    it("全て refunded の場合、売上・未収ともに0になる", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `All Refunded Event ${Date.now()}`,
        fee: 1000,
      });

      const attendances = [];
      for (let i = 0; i < 3; i++) {
        const attendance = await createTestAttendance(event.id, {
          email: `test-participant-${Date.now()}-${i}@example.com`,
        });
        attendances.push(attendance);
      }

      for (const attendance of attendances) {
        await createPayment(attendance.id, "refunded", 1000);
      }

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      expect(revenue.total_revenue).toBe(0);
      expect(revenue.paid_count).toBe(0);
      expect(revenue.pending_count).toBe(0);
    });
  });

  describe("設計書準拠: キャンセル（決済済み）の扱い", () => {
    it("決済完了後に not_attending に変更しても売上に計上される（会計原則）", async () => {
      const event = await createPaidTestEvent(testUser.id, {
        title: `Accounting Test ${Date.now()}`,
        fee: 1000,
      });
      const attendance1 = await createTestAttendance(event.id); // attending
      const attendance2 = await createTestAttendance(event.id); // attending

      // 両方とも決済完了
      await createPayment(attendance1.id, "paid", 1000);
      await createPayment(attendance2.id, "paid", 1000);

      // attendance2 を not_attending に変更（参加キャンセル）
      await supabase
        .from("attendances")
        .update({ status: "not_attending" })
        .eq("id", attendance2.id);

      const { data: revenue, error } = await supabase.rpc("update_revenue_summary", {
        p_event_id: event.id,
      });

      expect(error).toBeNull();
      // キャンセル後も決済ステータスは paid のまま維持されているため、
      // 売上として計上される（会計原則）
      expect(revenue.total_revenue).toBe(2000);
      expect(revenue.paid_count).toBe(2);

      // UI側で内訳を表示:
      // - 参加者分: attendance1 の 1000円
      // - キャンセル（決済済み）: attendance2 の 1000円
    });
  });
});
