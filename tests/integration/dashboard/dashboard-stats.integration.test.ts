/**
 * ダッシュボード統計情報 統合テスト
 *
 * getDashboardDataAction の統合テストを実装し、以下を検証します：
 * - 開催予定イベント数の正確な計算
 * - 参加予定者総数の集計（複数イベント横断）
 * - 未回収参加費の集計（決済ステータス考慮）
 * - キャンセルイベント・過去イベントの除外
 * - 最近のイベント取得（最大5件）
 *
 * 📋 モック戦略：
 * - getCurrentUser: モック化（認証レイヤー）
 * - Supabaseクライアント: 実際のクライアントを使用（データベース操作は本物）
 * - データ作成: AdminClientを使用して実際のDBにテストデータを作成
 *
 * これにより、認証以外の実際のビジネスロジックとDB操作をテストします。
 */

import { getCurrentUser } from "@core/auth/auth-utils";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { createClient } from "@core/supabase/server";

import { getDashboardDataAction } from "@features/events/actions/get-dashboard-stats";

import { createTestUser, deleteTestUser, type TestUser } from "@/tests/helpers/test-user";

// getCurrentUserをモック（jest-setupで設定済み）
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;

// createClientをモック
jest.mock("@core/supabase/server", () => ({
  createClient: jest.fn(),
}));
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe("ダッシュボード統計情報 統合テスト", () => {
  let testUser: TestUser;
  const createdEventIds: string[] = [];
  const createdAttendanceIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const secureFactory = SecureSupabaseClientFactory.getInstance();

  beforeAll(async () => {
    // テスト用ユーザーを作成
    testUser = await createTestUser(
      `dashboard-stats-test-${Date.now()}@example.com`,
      "TestPassword123"
    );
  });

  afterAll(async () => {
    // afterEachで各テスト後にクリーンアップ済みのため、
    // ここではテストユーザーの削除のみ実行
    await deleteTestUser(testUser.email);
  });

  beforeEach(async () => {
    // 各テストでユーザーを認証済み状態にする
    mockGetCurrentUser.mockResolvedValue({
      id: testUser.id,
      email: testUser.email,
      user_metadata: {},
      app_metadata: {},
    } as any);

    // createClientをモックしてadminクライアントを返す（RLSをバイパス）
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Mock Supabase client for dashboard stats test",
      {
        accessedTables: ["public.events", "public.attendances", "public.payments"],
      }
    );

    mockCreateClient.mockReturnValue(adminClient as any);
  });

  afterEach(async () => {
    // モックをリセット
    mockGetCurrentUser.mockReset();
    mockCreateClient.mockReset();

    // テスト間でのデータクリーンアップ（テストが失敗した場合でもクリーンアップ）
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_CLEANUP,
      "Dashboard stats test inter-test cleanup",
      {
        accessedTables: ["public.payments", "public.attendances", "public.events"],
      }
    );

    // 決済レコードを削除
    if (createdPaymentIds.length > 0) {
      await adminClient.from("payments").delete().in("id", createdPaymentIds);
      createdPaymentIds.length = 0; // 配列をクリア
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
   * テストヘルパー: 将来の日時を生成
   */
  function getFutureDateTime(hoursFromNow: number = 24): string {
    const futureDate = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    return futureDate.toISOString();
  }

  /**
   * テストヘルパー: 過去の日時を生成
   */
  function getPastDateTime(hoursAgo: number = 24): string {
    const pastDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    return pastDate.toISOString();
  }

  /**
   * テストヘルパー: テストイベントを作成
   */
  async function createEvent(options: {
    title: string;
    date: string;
    fee: number;
    canceled_at?: string | null;
  }) {
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Creating test event for dashboard stats",
      {
        operationType: "INSERT",
        accessedTables: ["public.events"],
      }
    );

    const eventDate = new Date(options.date);
    const registrationDeadline = new Date(eventDate.getTime() - 12 * 60 * 60 * 1000);
    const paymentDeadline = new Date(eventDate.getTime() - 6 * 60 * 60 * 1000);

    const { data: event, error } = await adminClient
      .from("events")
      .insert({
        title: options.title,
        date: options.date,
        fee: options.fee,
        created_by: testUser.id,
        registration_deadline: registrationDeadline.toISOString(),
        payment_deadline: options.fee > 0 ? paymentDeadline.toISOString() : null,
        payment_methods: options.fee > 0 ? ["stripe"] : [],
        canceled_at: options.canceled_at || null,
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
      "Creating test attendance for dashboard stats",
      {
        operationType: "INSERT",
        accessedTables: ["public.attendances"],
      }
    );

    // emailを生成（正規表現制約に適合する形式）
    const randomId = Math.random().toString(36).substring(2, 12);
    const email = `test${randomId}@example.com`;

    // guest_tokenを36文字以内に収める（gst_プレフィックス + 32文字のBase64）
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
      "Creating test payment for dashboard stats",
      {
        operationType: "INSERT",
        accessedTables: ["public.payments"],
      }
    );

    // statusが"paid"または"received"の場合はpaid_atを設定
    const paidAt = ["paid", "received"].includes(status) ? new Date().toISOString() : null;

    // Stripe決済の場合はstripe_payment_intent_idが必須
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

  describe("認証・認可", () => {
    test("未認証の場合はUNAUTHORIZEDエラーを返す", async () => {
      // getCurrentUserをnullを返すように設定（未認証状態をシミュレート）
      mockGetCurrentUser.mockResolvedValue(null as any);

      const result = await getDashboardDataAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNAUTHORIZED");
        expect(result.error).toBe("認証が必要です");
      }
    });
  });

  describe("開催予定イベント数の計算", () => {
    test("未来のイベントのみをカウントする", async () => {
      // 未来のイベント2件を作成
      await createEvent({
        title: "未来イベント1",
        date: getFutureDateTime(48),
        fee: 0,
      });

      await createEvent({
        title: "未来イベント2",
        date: getFutureDateTime(72),
        fee: 0,
      });

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stats.upcomingEventsCount).toBe(2);
      }
    });

    test("キャンセル済みイベントは除外される", async () => {
      // 未来のイベント2件（うち1件キャンセル）
      await createEvent({
        title: "未来イベント（アクティブ）",
        date: getFutureDateTime(48),
        fee: 0,
      });

      await createEvent({
        title: "未来イベント（キャンセル済み）",
        date: getFutureDateTime(72),
        fee: 0,
        canceled_at: new Date().toISOString(),
      });

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stats.upcomingEventsCount).toBe(1);
      }
    });
  });

  describe("参加予定者総数の集計", () => {
    test("複数イベントの参加者が正しく集計される", async () => {
      // イベント1: 参加者3名
      const event1 = await createEvent({
        title: "イベント1",
        date: getFutureDateTime(48),
        fee: 0,
      });
      await createAttendance(event1.id, "attending", "参加者1-1");
      await createAttendance(event1.id, "attending", "参加者1-2");
      await createAttendance(event1.id, "attending", "参加者1-3");

      // イベント2: 参加者2名
      const event2 = await createEvent({
        title: "イベント2",
        date: getFutureDateTime(72),
        fee: 0,
      });
      await createAttendance(event2.id, "attending", "参加者2-1");
      await createAttendance(event2.id, "attending", "参加者2-2");

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stats.totalUpcomingParticipants).toBe(5);
      }
    });

    test("maybe と not_attending は除外される", async () => {
      const event = await createEvent({
        title: "ステータス混在イベント",
        date: getFutureDateTime(48),
        fee: 0,
      });

      await createAttendance(event.id, "attending", "参加者A");
      await createAttendance(event.id, "attending", "参加者B");
      await createAttendance(event.id, "maybe", "参加者C");
      await createAttendance(event.id, "not_attending", "参加者D");

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stats.totalUpcomingParticipants).toBe(2);
      }
    });
  });

  describe("未回収参加費の計算", () => {
    test("未払いの参加者の参加費が正しく集計される", async () => {
      const event = await createEvent({
        title: "有料イベント",
        date: getFutureDateTime(48),
        fee: 3000,
      });

      // 参加者A: 決済完了（paid）
      const attendanceA = await createAttendance(event.id, "attending", "参加者A");
      await createPayment(attendanceA.id, 3000, "paid", "stripe");

      // 参加者B: 決済未完了（pending）
      const attendanceB = await createAttendance(event.id, "attending", "参加者B");
      await createPayment(attendanceB.id, 3000, "pending", "stripe");

      // 参加者C: 決済未完了（failed）
      const attendanceC = await createAttendance(event.id, "attending", "参加者C");
      await createPayment(attendanceC.id, 3000, "failed", "stripe");

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        // 未払いはB + C = 6000円
        expect(result.data.stats.unpaidFeesTotal).toBe(6000);
      }
    });

    test("無料イベントは未回収額に含まれない", async () => {
      const event = await createEvent({
        title: "無料イベント",
        date: getFutureDateTime(48),
        fee: 0,
      });

      await createAttendance(event.id, "attending", "参加者1");
      await createAttendance(event.id, "attending", "参加者2");
      await createAttendance(event.id, "attending", "参加者3");

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stats.unpaidFeesTotal).toBe(0);
      }
    });

    test("現金決済でreceived状態は未回収に含まれない", async () => {
      const event = await createEvent({
        title: "現金決済イベント",
        date: getFutureDateTime(48),
        fee: 2000,
      });

      // 参加者A: 現金決済 received（受領済み）
      const attendanceA = await createAttendance(event.id, "attending", "参加者A");
      await createPayment(attendanceA.id, 2000, "received", "cash");

      // 参加者B: 現金決済 pending（未受領）
      const attendanceB = await createAttendance(event.id, "attending", "参加者B");
      await createPayment(attendanceB.id, 2000, "pending", "cash");

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        // 未回収はBのみ = 2000円
        expect(result.data.stats.unpaidFeesTotal).toBe(2000);
      }
    });

    test("決済レコードがない参加者は未回収に含まれる", async () => {
      const event = await createEvent({
        title: "決済未作成イベント",
        date: getFutureDateTime(48),
        fee: 5000,
      });

      // 決済レコードを作成しない参加者
      await createAttendance(event.id, "attending", "未決済参加者");

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        // 決済レコードがないので未回収 = 5000円
        expect(result.data.stats.unpaidFeesTotal).toBe(5000);
      }
    });
  });

  describe("最近のイベント取得", () => {
    test("最大5件のイベントが取得される", async () => {
      // 7件のイベントを作成（created_atの順序を確保するため少し間隔を空ける）
      for (let i = 1; i <= 7; i++) {
        await createEvent({
          title: `イベント${i}`,
          date: getFutureDateTime(48 + i * 24), // 各イベントを1日ずつずらす
          fee: 0,
        });
        // 作成時刻を確実に異なるものにするため少し待機
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recentEvents.length).toBe(5);
      }
    });

    test("参加者数が正しく含まれる", async () => {
      const event = await createEvent({
        title: "参加者付きイベント",
        date: getFutureDateTime(48),
        fee: 0,
      });

      await createAttendance(event.id, "attending", "参加者1");
      await createAttendance(event.id, "attending", "参加者2");
      await createAttendance(event.id, "attending", "参加者3");
      await createAttendance(event.id, "maybe", "参加者4"); // maybeは含まれない

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        const recentEvent = result.data.recentEvents.find((e) => e.id === event.id);
        expect(recentEvent).toBeDefined();
        expect(recentEvent?.attendances_count).toBe(3);
      }
    });

    test("イベントステータスが正しく計算される", async () => {
      // 未来のイベント
      const futureEvent = await createEvent({
        title: "未来イベント",
        date: getFutureDateTime(48),
        fee: 0,
      });

      // キャンセル済みイベント
      const canceledEvent = await createEvent({
        title: "キャンセルイベント",
        date: getFutureDateTime(72),
        fee: 0,
        canceled_at: new Date().toISOString(),
      });

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        const futureEventResult = result.data.recentEvents.find((e) => e.id === futureEvent.id);
        const canceledEventResult = result.data.recentEvents.find((e) => e.id === canceledEvent.id);

        expect(futureEventResult?.status).toBe("upcoming");
        expect(canceledEventResult?.status).toBe("canceled");
      }
    });
  });

  describe("エッジケース", () => {
    test("イベントが存在しない場合は全て0を返す", async () => {
      // 新しいユーザーを作成（イベントなし）
      const newUser = await createTestUser(
        `no-events-user-${Date.now()}@example.com`,
        "TestPassword123"
      );

      try {
        // モックを新しいユーザーに設定
        mockGetCurrentUser.mockResolvedValue({
          id: newUser.id,
          email: newUser.email,
          user_metadata: {},
          app_metadata: {},
        } as any);

        // 新しいユーザー用のadminクライアントを設定
        const newUserAdminClient = await secureFactory.createAuditedAdminClient(
          AdminReason.TEST_DATA_SETUP,
          "Mock Supabase client for new user test",
          {
            accessedTables: ["public.events", "public.attendances", "public.payments"],
          }
        );
        mockCreateClient.mockReturnValue(newUserAdminClient as any);

        const result = await getDashboardDataAction();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.stats.upcomingEventsCount).toBe(0);
          expect(result.data.stats.totalUpcomingParticipants).toBe(0);
          expect(result.data.stats.unpaidFeesTotal).toBe(0);
          expect(result.data.stats.stripeAccountBalance).toBe(0);
          expect(result.data.recentEvents).toEqual([]);
        }
      } finally {
        // テスト失敗時も確実にクリーンアップ
        await deleteTestUser(newUser.email);

        // 元のユーザーにモックを戻す（afterEachで自動的に戻るが念のため）
        mockGetCurrentUser.mockResolvedValue({
          id: testUser.id,
          email: testUser.email,
          user_metadata: {},
          app_metadata: {},
        } as any);

        // 元のadminクライアントに戻す
        const originalAdminClient = await secureFactory.createAuditedAdminClient(
          AdminReason.TEST_DATA_SETUP,
          "Restore original admin client",
          {
            accessedTables: ["public.events", "public.attendances", "public.payments"],
          }
        );
        mockCreateClient.mockReturnValue(originalAdminClient as any);
      }
    });

    test("キャンセル済みイベントのみの場合は開催予定が0になる", async () => {
      // キャンセル済みイベントのみを作成
      await createEvent({
        title: "キャンセルイベント1",
        date: getFutureDateTime(48),
        fee: 0,
        canceled_at: new Date().toISOString(),
      });

      await createEvent({
        title: "キャンセルイベント2",
        date: getFutureDateTime(72),
        fee: 0,
        canceled_at: new Date().toISOString(),
      });

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        // キャンセル済みイベントは開催予定にカウントされない
        expect(result.data.stats.upcomingEventsCount).toBe(0);
        // ただし recentEvents には含まれる
        expect(result.data.recentEvents.length).toBeGreaterThan(0);
      }
    });
  });

  describe("複合シナリオ", () => {
    test("複数の有料・無料イベントが混在する場合の統計", async () => {
      // 未来の無料イベント
      const freeEvent = await createEvent({
        title: "無料イベント",
        date: getFutureDateTime(48),
        fee: 0,
      });
      await createAttendance(freeEvent.id, "attending", "無料参加者1");
      await createAttendance(freeEvent.id, "attending", "無料参加者2");

      // 未来の有料イベント
      const paidEvent = await createEvent({
        title: "有料イベント",
        date: getFutureDateTime(72),
        fee: 2000,
      });
      const paidAttendance1 = await createAttendance(paidEvent.id, "attending", "有料参加者1");
      await createPayment(paidAttendance1.id, 2000, "paid", "stripe");

      const paidAttendance2 = await createAttendance(paidEvent.id, "attending", "有料参加者2");
      await createPayment(paidAttendance2.id, 2000, "pending", "stripe");

      const result = await getDashboardDataAction();

      expect(result.success).toBe(true);
      if (result.success) {
        // 開催予定イベント: 無料イベント + 有料イベント = 2件
        expect(result.data.stats.upcomingEventsCount).toBe(2);

        // 参加予定者: 無料2名 + 有料2名 = 4名
        expect(result.data.stats.totalUpcomingParticipants).toBe(4);

        // 未回収参加費: 有料イベントの未払い1名のみ = 2000円
        expect(result.data.stats.unpaidFeesTotal).toBe(2000);
      }
    });
  });
});
