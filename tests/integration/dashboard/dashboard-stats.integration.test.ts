/**
 * ダッシュボード統計情報 統合テスト
 *
 * getDashboardStatsAction / getRecentEventsAction の統合テストを実装し、以下を検証します：
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

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import type { CurrentCommunitySummary } from "@core/community/current-community";
import { resolveCurrentCommunityForServerAction } from "@core/community/current-community";
import { okResult } from "@core/errors/app-result";
import { createServerActionSupabaseClient } from "@core/supabase/factory";

import {
  createCommonTestSetup,
  createTestDataCleanupHelper,
  type CommonTestSetup,
} from "@tests/setup/common-test-setup";

import { getDashboardStatsAction, getRecentEventsAction } from "@/app/(app)/events/actions";
import { createOwnedCommunityFixture } from "@/tests/helpers/community-owner-fixtures";
import { getFutureDateTime } from "@/tests/helpers/test-datetime";
import {
  createEventForDashboardStats,
  createAttendanceForDashboardStats,
  createPaymentForDashboardStats,
} from "@/tests/helpers/test-payment-data";
import { createTestUser, deleteTestUser } from "@/tests/helpers/test-user";

jest.mock("@core/auth/auth-utils", () => ({
  getCurrentUserForServerAction: jest.fn(),
}));

jest.mock("@core/community/current-community", () => ({
  resolveCurrentCommunityForServerAction: jest.fn(),
}));

// createServerActionSupabaseClientをモック
jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: jest.fn(),
}));

describe("ダッシュボード統計情報 統合テスト", () => {
  let setup: CommonTestSetup;
  let mockGetCurrentUser: jest.MockedFunction<typeof getCurrentUserForServerAction>;
  let mockResolveCurrentCommunity: jest.MockedFunction<
    typeof resolveCurrentCommunityForServerAction
  >;
  let mockCreateServerActionClient: jest.MockedFunction<typeof createServerActionSupabaseClient>;
  let cleanupHelper: ReturnType<typeof createTestDataCleanupHelper>;
  let currentCommunity: CurrentCommunitySummary | null;

  function applyCurrentCommunity(summary: CurrentCommunitySummary | null) {
    currentCommunity = summary;
    (setup.adminClient as any)._test_community_id = summary?.id;

    mockResolveCurrentCommunity.mockResolvedValue(
      okResult({
        currentCommunity: summary,
        ownedCommunities: summary ? [summary] : [],
        requestedCommunityId: summary?.id ?? null,
        cookieMutation: summary ? "none" : "clear",
        resolvedBy: summary ? "cookie" : "empty",
      })
    );
  }

  async function provisionCurrentCommunity(
    options: {
      withPayoutProfile?: boolean;
      name?: string;
    } = {}
  ) {
    const fixture = await createOwnedCommunityFixture(setup.testUser.id, options);

    cleanupHelper.trackCommunity(fixture.community.id);

    if (fixture.payoutProfileId) {
      cleanupHelper.trackPayoutProfile(fixture.payoutProfileId);
    }

    (setup.adminClient as any)._test_payout_profile_id = fixture.payoutProfileId;

    applyCurrentCommunity({
      id: fixture.community.id,
      name: fixture.community.name,
      slug: fixture.community.slug,
      createdAt: new Date().toISOString(),
    });

    return fixture;
  }

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `dashboard-stats-test-${Date.now()}`,
      withConnect: false,
      accessedTables: [
        "public.payments",
        "public.attendances",
        "public.events",
        "public.communities",
        "public.payout_profiles",
      ],
    });
    mockGetCurrentUser = getCurrentUserForServerAction as jest.MockedFunction<
      typeof getCurrentUserForServerAction
    >;
    mockResolveCurrentCommunity = resolveCurrentCommunityForServerAction as jest.MockedFunction<
      typeof resolveCurrentCommunityForServerAction
    >;
    mockCreateServerActionClient = createServerActionSupabaseClient as jest.MockedFunction<
      typeof createServerActionSupabaseClient
    >;

    // createTestDataCleanupHelperを使用してクリーンアップ処理を標準化
    cleanupHelper = createTestDataCleanupHelper(setup.adminClient);
  });

  afterAll(async () => {
    if (setup) {
      await setup.cleanup();
    }
  });

  // ...

  beforeEach(async () => {
    currentCommunity = null;

    // 認証モックを再設定（共通モック設定を使用）
    mockGetCurrentUser.mockResolvedValue({
      id: setup.testUser.id,
      email: setup.testUser.email,
      user_metadata: {},
      app_metadata: {},
    } as any);

    // テストユーザーとしてログインしたクライアントを作成してモックに返す
    // これにより、Server Action内で auth.uid() が正しく機能するようになる
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const authClient = createSupabaseClient(supabaseUrl, supabaseAnonKey);

    // ログイン処理
    const { error } = await authClient.auth.signInWithPassword({
      email: setup.testUser.email,
      password: setup.testUser.password,
    });

    if (error) {
      throw new Error(`Failed to sign in test user: ${error.message}`);
    }

    // Server Action がこのクライアントを使用する
    mockCreateServerActionClient.mockResolvedValue(authClient as any);
    await provisionCurrentCommunity();
  });

  afterEach(async () => {
    mockGetCurrentUser?.mockReset();
    mockResolveCurrentCommunity?.mockReset();
    mockCreateServerActionClient?.mockReset();
    if (setup?.adminClient) {
      (setup.adminClient as any)._test_community_id = undefined;
      (setup.adminClient as any)._test_payout_profile_id = undefined;
    }
    currentCommunity = null;

    // テスト間でのデータクリーンアップ（createTestDataCleanupHelperを使用）
    if (cleanupHelper) {
      try {
        await cleanupHelper.cleanup();
        cleanupHelper.reset();
      } catch (error) {
        console.warn("Inter-test cleanup failed:", error);
      }
    }
  });

  describe("認証・認可", () => {
    test("未認証の場合はUNAUTHORIZEDエラーを返す", async () => {
      // getCurrentUserをnullを返すように設定（未認証状態をシミュレート）
      mockGetCurrentUser.mockResolvedValue(null as any);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.code).toBe("UNAUTHORIZED");
        expect(result.error?.userMessage).toBe("認証が必要です");
      }
    });
  });

  describe("開催予定イベント数の計算", () => {
    test("未来のイベントのみをカウントする", async () => {
      // 未来のイベント2件を作成
      const event1 = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "未来イベント1",
        date: getFutureDateTime(48),
        fee: 0,
      });
      cleanupHelper.trackEvent(event1.id);

      const event2 = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "未来イベント2",
        date: getFutureDateTime(72),
        fee: 0,
      });
      cleanupHelper.trackEvent(event2.id);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data!.upcomingEventsCount).toBe(2);
      }
    });

    test("キャンセル済みイベントは除外される", async () => {
      // 未来のイベント2件（うち1件キャンセル）
      const event1 = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "未来イベント（アクティブ）",
        date: getFutureDateTime(48),
        fee: 0,
      });
      cleanupHelper.trackEvent(event1.id);

      const event2 = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "未来イベント（キャンセル済み）",
        date: getFutureDateTime(72),
        fee: 0,
        canceled_at: new Date().toISOString(),
      });
      cleanupHelper.trackEvent(event2.id);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data!.upcomingEventsCount).toBe(1);
      }
    });
  });

  describe("参加予定者総数の集計", () => {
    test("複数イベントの参加者が正しく集計される", async () => {
      // イベント1: 参加者3名
      const event1 = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "イベント1",
        date: getFutureDateTime(48),
        fee: 0,
      });
      cleanupHelper.trackEvent(event1.id);
      const attendance1_1 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event1.id,
        [],
        "attending",
        "参加者1-1"
      );
      cleanupHelper.trackAttendance(attendance1_1.id);
      const attendance1_2 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event1.id,
        [],
        "attending",
        "参加者1-2"
      );
      cleanupHelper.trackAttendance(attendance1_2.id);
      const attendance1_3 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event1.id,
        [],
        "attending",
        "参加者1-3"
      );
      cleanupHelper.trackAttendance(attendance1_3.id);

      // イベント2: 参加者2名
      const event2 = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "イベント2",
        date: getFutureDateTime(72),
        fee: 0,
      });
      cleanupHelper.trackEvent(event2.id);
      const attendance2_1 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event2.id,
        [],
        "attending",
        "参加者2-1"
      );
      cleanupHelper.trackAttendance(attendance2_1.id);
      const attendance2_2 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event2.id,
        [],
        "attending",
        "参加者2-2"
      );
      cleanupHelper.trackAttendance(attendance2_2.id);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data!.totalUpcomingParticipants).toBe(5);
      }
    });

    test("maybe と not_attending は除外される", async () => {
      const event = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "ステータス混在イベント",
        date: getFutureDateTime(48),
        fee: 0,
      });
      cleanupHelper.trackEvent(event.id);

      const attendanceA = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者A"
      );
      cleanupHelper.trackAttendance(attendanceA.id);
      const attendanceB = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者B"
      );
      cleanupHelper.trackAttendance(attendanceB.id);
      const attendanceC = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "maybe",
        "参加者C"
      );
      cleanupHelper.trackAttendance(attendanceC.id);
      const attendanceD = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "not_attending",
        "参加者D"
      );
      cleanupHelper.trackAttendance(attendanceD.id);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data!.totalUpcomingParticipants).toBe(2);
      }
    });
  });

  describe("current community フィルタ", () => {
    test("選択中コミュニティに属するイベントだけを集計する", async () => {
      const primaryCommunity = currentCommunity;
      const secondaryCommunity = await createOwnedCommunityFixture(setup.testUser.id, {
        name: "secondary-community",
      });

      cleanupHelper.trackCommunity(secondaryCommunity.community.id);
      if (secondaryCommunity.payoutProfileId) {
        cleanupHelper.trackPayoutProfile(secondaryCommunity.payoutProfileId);
      }

      const primaryEvent = await createEventForDashboardStats(
        setup.adminClient,
        setup.testUser.id,
        [],
        {
          title: "primary-event",
          date: getFutureDateTime(48),
          fee: 0,
          communityId: primaryCommunity!.id,
        }
      );
      cleanupHelper.trackEvent(primaryEvent.id);

      const secondaryEvent = await createEventForDashboardStats(
        setup.adminClient,
        setup.testUser.id,
        [],
        {
          title: "secondary-event",
          date: getFutureDateTime(72),
          fee: 0,
          communityId: secondaryCommunity.community.id,
        }
      );
      cleanupHelper.trackEvent(secondaryEvent.id);

      const primaryAttendance = await createAttendanceForDashboardStats(
        setup.adminClient,
        primaryEvent.id,
        [],
        "attending",
        "primary-attendee"
      );
      cleanupHelper.trackAttendance(primaryAttendance.id);

      const secondaryAttendance = await createAttendanceForDashboardStats(
        setup.adminClient,
        secondaryEvent.id,
        [],
        "attending",
        "secondary-attendee"
      );
      cleanupHelper.trackAttendance(secondaryAttendance.id);

      const statsResult = await getDashboardStatsAction();
      const recentResult = await getRecentEventsAction();

      expect(statsResult.success).toBe(true);
      expect(recentResult.success).toBe(true);

      if (statsResult.success) {
        expect(statsResult.data!.upcomingEventsCount).toBe(1);
        expect(statsResult.data!.totalUpcomingParticipants).toBe(1);
      }

      if (recentResult.success) {
        expect(recentResult.data!.map((event: any) => event.id)).toContain(primaryEvent.id);
        expect(recentResult.data!.map((event: any) => event.id)).not.toContain(secondaryEvent.id);
      }
    });
  });

  describe("未回収参加費の計算", () => {
    test("未払いの参加者の参加費が正しく集計される", async () => {
      const event = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "有料イベント",
        date: getFutureDateTime(48),
        fee: 3000,
      });
      cleanupHelper.trackEvent(event.id);

      // 参加者A: 決済完了（paid）
      const attendanceA = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者A"
      );
      cleanupHelper.trackAttendance(attendanceA.id);
      const paymentA = await createPaymentForDashboardStats(
        setup.adminClient,
        attendanceA.id,
        [],
        3000,
        "paid",
        "stripe"
      );
      cleanupHelper.trackPayment(paymentA.id);

      // 参加者B: 決済未完了（pending）
      const attendanceB = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者B"
      );
      cleanupHelper.trackAttendance(attendanceB.id);
      const paymentB = await createPaymentForDashboardStats(
        setup.adminClient,
        attendanceB.id,
        [],
        3000,
        "pending",
        "stripe"
      );
      cleanupHelper.trackPayment(paymentB.id);

      // 参加者C: 決済未完了（failed）
      const attendanceC = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者C"
      );
      cleanupHelper.trackAttendance(attendanceC.id);
      const paymentC = await createPaymentForDashboardStats(
        setup.adminClient,
        attendanceC.id,
        [],
        3000,
        "failed",
        "stripe"
      );
      cleanupHelper.trackPayment(paymentC.id);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        // 未払いはB + C = 6000円
        expect(result.data!.unpaidFeesTotal).toBe(6000);
      }
    });

    test("無料イベントは未回収額に含まれない", async () => {
      const event = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "無料イベント",
        date: getFutureDateTime(48),
        fee: 0,
      });
      cleanupHelper.trackEvent(event.id);

      const attendance1 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者1"
      );
      cleanupHelper.trackAttendance(attendance1.id);
      const attendance2 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者2"
      );
      cleanupHelper.trackAttendance(attendance2.id);
      const attendance3 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者3"
      );
      cleanupHelper.trackAttendance(attendance3.id);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data!.unpaidFeesTotal).toBe(0);
      }
    });

    test("現金決済でreceived状態は未回収に含まれない", async () => {
      const event = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "現金決済イベント",
        date: getFutureDateTime(48),
        fee: 2000,
      });
      cleanupHelper.trackEvent(event.id);

      // 参加者A: 現金決済 received（受領済み）
      const attendanceA = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者A"
      );
      cleanupHelper.trackAttendance(attendanceA.id);
      const paymentA = await createPaymentForDashboardStats(
        setup.adminClient,
        attendanceA.id,
        [],
        2000,
        "received",
        "cash"
      );
      cleanupHelper.trackPayment(paymentA.id);

      // 参加者B: 現金決済 pending（未受領）
      const attendanceB = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者B"
      );
      cleanupHelper.trackAttendance(attendanceB.id);
      const paymentB = await createPaymentForDashboardStats(
        setup.adminClient,
        attendanceB.id,
        [],
        2000,
        "pending",
        "cash"
      );
      cleanupHelper.trackPayment(paymentB.id);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        // 未回収はBのみ = 2000円
        expect(result.data!.unpaidFeesTotal).toBe(2000);
      }
    });

    test("決済レコードがない参加者は未回収に含まれる", async () => {
      const event = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "決済未作成イベント",
        date: getFutureDateTime(48),
        fee: 5000,
      });
      cleanupHelper.trackEvent(event.id);

      // 決済レコードを作成しない参加者
      const attendance = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "未決済参加者"
      );
      cleanupHelper.trackAttendance(attendance.id);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        // 決済レコードがないので未回収 = 5000円
        expect(result.data!.unpaidFeesTotal).toBe(5000);
      }
    });
  });

  describe("最近のイベント取得", () => {
    test("最大5件のイベントが取得される", async () => {
      // 7件のイベントを作成（created_atの順序を確保するため少し間隔を空ける）
      for (let i = 1; i <= 7; i++) {
        const event = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
          title: `イベント${i}`,
          date: getFutureDateTime(48 + i * 24), // 各イベントを1日ずつずらす
          fee: 0,
        });
        cleanupHelper.trackEvent(event.id);
        // 作成時刻を確実に異なるものにするため少し待機
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const result = await getRecentEventsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data!.length).toBe(5);
      }
    });

    test("参加者数が正しく含まれる", async () => {
      const event = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "参加者付きイベント",
        date: getFutureDateTime(48),
        fee: 0,
      });
      cleanupHelper.trackEvent(event.id);

      const attendance1 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者1"
      );
      cleanupHelper.trackAttendance(attendance1.id);
      const attendance2 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者2"
      );
      cleanupHelper.trackAttendance(attendance2.id);
      const attendance3 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "attending",
        "参加者3"
      );
      cleanupHelper.trackAttendance(attendance3.id);
      const attendance4 = await createAttendanceForDashboardStats(
        setup.adminClient,
        event.id,
        [],
        "maybe",
        "参加者4"
      ); // maybeは含まれない
      cleanupHelper.trackAttendance(attendance4.id);

      const result = await getRecentEventsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        const recentEvent = result.data!.find((e: any) => e.id === event.id);
        expect(recentEvent).toBeDefined();
        expect(recentEvent?.attendances_count).toBe(3);
      }
    });

    test("イベントステータスが正しく計算される", async () => {
      // 未来のイベント
      const futureEvent = await createEventForDashboardStats(
        setup.adminClient,
        setup.testUser.id,
        [],
        {
          title: "未来イベント",
          date: getFutureDateTime(48),
          fee: 0,
        }
      );
      cleanupHelper.trackEvent(futureEvent.id);

      // キャンセル済みイベント
      const canceledEvent = await createEventForDashboardStats(
        setup.adminClient,
        setup.testUser.id,
        [],
        {
          title: "キャンセルイベント",
          date: getFutureDateTime(72),
          fee: 0,
          canceled_at: new Date().toISOString(),
        }
      );
      cleanupHelper.trackEvent(canceledEvent.id);

      const result = await getRecentEventsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        const futureEventResult = result.data!.find((e: any) => e.id === futureEvent.id);
        const canceledEventResult = result.data!.find((e: any) => e.id === canceledEvent.id);

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
        applyCurrentCommunity(null);

        const statsResult = await getDashboardStatsAction();
        const recentResult = await getRecentEventsAction();

        expect(statsResult.success).toBe(true);
        expect(recentResult.success).toBe(true);

        if (statsResult.success) {
          expect(statsResult.data!.upcomingEventsCount).toBe(0);
          expect(statsResult.data!.totalUpcomingParticipants).toBe(0);
          expect(statsResult.data!.unpaidFeesTotal).toBe(0);
          expect(statsResult.data!.stripeAccountBalance).toBe(0);
        }

        if (recentResult.success) {
          expect(recentResult.data).toEqual([]);
        }
      } finally {
        // テスト失敗時も確実にクリーンアップ
        await deleteTestUser(newUser.email);

        // 元のユーザーにモックを戻す（afterEachで自動的に戻るが念のため）
        mockGetCurrentUser.mockResolvedValue({
          id: setup.testUser.id,
          email: setup.testUser.email,
          user_metadata: {},
          app_metadata: {},
        } as any);
      }
    });

    test("キャンセル済みイベントのみの場合は開催予定が0になる", async () => {
      // キャンセル済みイベントのみを作成
      const event1 = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "キャンセルイベント1",
        date: getFutureDateTime(48),
        fee: 0,
        canceled_at: new Date().toISOString(),
      });
      cleanupHelper.trackEvent(event1.id);

      const event2 = await createEventForDashboardStats(setup.adminClient, setup.testUser.id, [], {
        title: "キャンセルイベント2",
        date: getFutureDateTime(72),
        fee: 0,
        canceled_at: new Date().toISOString(),
      });
      cleanupHelper.trackEvent(event2.id);

      const statsResult = await getDashboardStatsAction();
      const recentResult = await getRecentEventsAction();

      expect(statsResult.success).toBe(true);
      expect(recentResult.success).toBe(true);

      if (statsResult.success) {
        // キャンセル済みイベントは開催予定にカウントされない
        expect(statsResult.data!.upcomingEventsCount).toBe(0);
      }

      if (recentResult.success) {
        // ただし recentEvents には含まれる
        expect(recentResult.data!.length).toBeGreaterThan(0);
      }
    });
  });

  describe("複合シナリオ", () => {
    test("複数の有料・無料イベントが混在する場合の統計", async () => {
      // 未来の無料イベント
      const freeEvent = await createEventForDashboardStats(
        setup.adminClient,
        setup.testUser.id,
        [],
        {
          title: "無料イベント",
          date: getFutureDateTime(48),
          fee: 0,
        }
      );
      cleanupHelper.trackEvent(freeEvent.id);
      const freeAttendance1 = await createAttendanceForDashboardStats(
        setup.adminClient,
        freeEvent.id,
        [],
        "attending",
        "無料参加者1"
      );
      cleanupHelper.trackAttendance(freeAttendance1.id);
      const freeAttendance2 = await createAttendanceForDashboardStats(
        setup.adminClient,
        freeEvent.id,
        [],
        "attending",
        "無料参加者2"
      );
      cleanupHelper.trackAttendance(freeAttendance2.id);

      // 未来の有料イベント
      const paidEvent = await createEventForDashboardStats(
        setup.adminClient,
        setup.testUser.id,
        [],
        {
          title: "有料イベント",
          date: getFutureDateTime(72),
          fee: 2000,
        }
      );
      cleanupHelper.trackEvent(paidEvent.id);
      const paidAttendance1 = await createAttendanceForDashboardStats(
        setup.adminClient,
        paidEvent.id,
        [],
        "attending",
        "有料参加者1"
      );
      cleanupHelper.trackAttendance(paidAttendance1.id);
      const payment1 = await createPaymentForDashboardStats(
        setup.adminClient,
        paidAttendance1.id,
        [],
        2000,
        "paid",
        "stripe"
      );
      cleanupHelper.trackPayment(payment1.id);

      const paidAttendance2 = await createAttendanceForDashboardStats(
        setup.adminClient,
        paidEvent.id,
        [],
        "attending",
        "有料参加者2"
      );
      cleanupHelper.trackAttendance(paidAttendance2.id);
      const payment2 = await createPaymentForDashboardStats(
        setup.adminClient,
        paidAttendance2.id,
        [],
        2000,
        "pending",
        "stripe"
      );
      cleanupHelper.trackPayment(payment2.id);

      const result = await getDashboardStatsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        // 開催予定イベント: 無料イベント + 有料イベント = 2件
        expect(result.data!.upcomingEventsCount).toBe(2);

        // 参加予定者: 無料2名 + 有料2名 = 4名
        expect(result.data!.totalUpcomingParticipants).toBe(4);

        // 未回収参加費: 有料イベントの未払い1名のみ = 2000円
        expect(result.data!.unpaidFeesTotal).toBe(2000);
      }
    });
  });
});
