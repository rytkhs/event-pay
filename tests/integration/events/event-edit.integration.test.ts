/**
 * イベント編集 統合テスト（Server Action: updateEventAction）
 *
 * カバレッジ指向のケース設計:
 * - 正常系: 基本項目の更新、空欄クリア、fee=0→payment_methods=[]
 * - 制約系: 参加者/決済済み存在時の制限、定員と参加者数の関係、締切相関・上限、猶予上限
 * - 挙動系: 未認証、権限なし、存在しないID
 */

import { jest } from "@jest/globals";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult } from "@core/errors/app-result";
import { getCurrentCommunityServerActionContext } from "@core/community/current-community";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { createCommunityOwnedEventFixture } from "@tests/helpers/community-owner-fixtures";
import { setupNextCacheMocks } from "@tests/setup/common-mocks";
import {
  createMultiUserTestSetup,
  createTestDataCleanupHelper,
  type MultiUserTestSetup,
} from "@tests/setup/common-test-setup";

import { getFutureDateTimeLocal } from "@/tests/helpers/test-datetime";
import { buildFormData } from "@/tests/helpers/test-form-data";
import { createPaidStripePayment, createTestAttendance } from "@/tests/helpers/test-payment-data";

// next/cache は副作用を持たないようにモック（共通関数を使用するため、モック化のみ宣言）
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@core/community/current-community", () => ({
  getCurrentCommunityServerActionContext: jest.fn(),
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: jest.fn(),
}));

const mockGetCurrentCommunityServerActionContext =
  getCurrentCommunityServerActionContext as jest.MockedFunction<
    typeof getCurrentCommunityServerActionContext
  >;
const mockCreateServerActionSupabaseClient =
  createServerActionSupabaseClient as jest.MockedFunction<typeof createServerActionSupabaseClient>;

describe("イベント編集 統合テスト", () => {
  let setup: MultiUserTestSetup;
  let cleanupHelper: ReturnType<typeof createTestDataCleanupHelper>;
  // userA: Connect設定済み（インデックス0）、userB: Connect未設定（インデックス1）
  const getUserA = () => setup.users[0];
  const getUserB = () => setup.users[1];

  beforeAll(async () => {
    setupNextCacheMocks();
    setup = await createMultiUserTestSetup({
      testName: `event-edit-test-${Date.now()}`,
      userCount: 2,
      withConnect: [true, false], // userAはConnect設定済み、userBは未設定
      accessedTables: ["public.events", "public.attendances", "public.payments"],
    });

    // createTestDataCleanupHelperを使用してクリーンアップ処理を標準化
    cleanupHelper = createTestDataCleanupHelper(setup.adminClient);
  });

  afterAll(async () => {
    try {
      // テスト実行（必要に応じて）
    } finally {
      // 必ずクリーンアップを実行
      if (cleanupHelper) {
        await cleanupHelper.cleanup();
      }
      if (setup) {
        await setup.cleanup();
      }
    }
  });

  async function createTrackedEvent(
    userId: string,
    options: Parameters<typeof createCommunityOwnedEventFixture>[1] = {}
  ) {
    const fixture = await createCommunityOwnedEventFixture(userId, options);
    cleanupHelper.trackEvent(fixture.event.id);
    cleanupHelper.trackCommunity(fixture.communityId);
    if (fixture.payoutProfileId) {
      cleanupHelper.trackPayoutProfile(fixture.payoutProfileId);
    }
    return fixture;
  }

  async function createTrackedEventWithParticipants(
    userId: string,
    options: Parameters<typeof createCommunityOwnedEventFixture>[1] = {},
    participantCount: number = 1
  ) {
    const fixture = await createTrackedEvent(userId, options);

    for (let i = 0; i < participantCount; i++) {
      const attendance = await createTestAttendance(fixture.event.id, {
        email: `event-edit-${Date.now()}-${i}@example.com`,
      });
      cleanupHelper.trackAttendance(attendance.id);
    }

    return fixture;
  }

  function mockUpdateActionContext(userId: string, currentCommunityId: string) {
    mockCreateServerActionSupabaseClient.mockResolvedValue(setup.adminClient);
    mockGetCurrentCommunityServerActionContext.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: currentCommunityId,
          name: "Current Community",
          slug: "current-community",
          createdAt: new Date().toISOString(),
        },
        user: {
          id: userId,
          email: `${userId}@example.com`,
          user_metadata: {},
          app_metadata: {},
        } as any,
      })
    );
  }

  test("正常系: タイトル/場所/説明を更新できる", async () => {
    const fixture = await createTrackedEvent(getUserA().id, { fee: 0, payment_methods: [] });
    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    const fd = buildFormData({
      title: "編集後タイトル",
      location: "編集後会場",
      description: "編集後説明",
    });

    const res = await updateEventAction(fixture.event.id, fd);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.title).toBe("編集後タイトル");
      expect(res.data.location).toBe("編集後会場");
      expect(res.data.description).toBe("編集後説明");
    }
  });

  test("正常系: 空欄送信で location/description/capacity/payment_deadline をクリア", async () => {
    const fixture = await createTrackedEvent(getUserA().id, {
      fee: 1000,
      payment_methods: ["cash"],
      location: "元会場",
      description: "元説明",
      capacity: 100,
      payment_deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    const fd = buildFormData({
      location: "",
      description: "",
      capacity: "",
      payment_deadline: "",
    });

    const res = await updateEventAction(fixture.event.id, fd);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.location).toBeNull();
      expect(res.data.description).toBeNull();
      expect(res.data.capacity).toBeNull();
      expect(res.data.payment_deadline).toBeNull();
    }
  });

  test("正常系: registration_deadline を空欄送信は無視される（必須フィールドのため）", async () => {
    const originalDeadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const fixture = await createTrackedEvent(getUserA().id, {
      fee: 0,
      payment_methods: [],
      registration_deadline: originalDeadline, // 1時間後
    });

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // registration_deadline を空文字で送信（無視されるべき）
    const fd = buildFormData({
      registration_deadline: "",
    });

    const res = await updateEventAction(fixture.event.id, fd);
    if (!res.success) {
      console.log("Error response for registration_deadline test:", res);
    }
    expect(res.success).toBe(true);
    if (res.success) {
      // 既存値が維持される（クリアされない）
      // 日付形式の違いを考慮して Date オブジェクトで比較
      expect(res.data.registration_deadline).toBeTruthy();
      expect(new Date(res.data.registration_deadline).getTime()).toBe(
        new Date(originalDeadline).getTime()
      );
    }
  });

  test("正常系: fee=0 に更新すると payment_methods は [] になる", async () => {
    const fixture = await createTrackedEvent(getUserA().id, {
      fee: 1000,
      payment_methods: ["stripe"],
      payment_deadline: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    });

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    const fd = buildFormData({ fee: "0" });
    const res = await updateEventAction(fixture.event.id, fd);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.fee).toBe(0);
      expect(res.data.payment_methods).toEqual([]);
    }
  });

  test("制約: 決済済み参加者がいると fee/payment_methods はロックされる", async () => {
    // 有料イベント + 参加者 + paid決済
    const fixture = await createTrackedEvent(getUserA().id, {
      fee: 1000,
      payment_methods: ["stripe"],
      payment_deadline: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    });
    const at = await createTestAttendance(fixture.event.id);
    cleanupHelper.trackAttendance(at.id);
    const payment = await createPaidStripePayment(at.id, {
      amount: fixture.event.fee,
      payoutProfileId: fixture.event.payout_profile_id || undefined,
    });
    cleanupHelper.trackPayment(payment.id);

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // 参加費の変更は不可
    const resFee = await updateEventAction(fixture.event.id, buildFormData({ fee: "2000" }));
    expect(resFee.success).toBe(false);
    if (!resFee.success) expect(resFee.error.code).toBe("RESOURCE_CONFLICT");

    // 決済方法の変更も不可
    const resPm = await updateEventAction(
      fixture.event.id,
      buildFormData({ payment_methods: ["cash"] })
    );
    expect(resPm.success).toBe(false);
    if (!resPm.success) expect(resPm.error.code).toBe("RESOURCE_CONFLICT");
  });

  test("制約: Stripe選択時はpayment_deadline必須（更新時も作成時と同様）", async () => {
    const fixture = await createTrackedEvent(getUserA().id, {
      fee: 1000,
      payment_methods: ["cash"], // 初期は現金のみ
    });

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // Stripeを追加するがpayment_deadlineを指定しない（エラーになるべき）
    const res = await updateEventAction(
      fixture.event.id,
      buildFormData({
        payment_methods: ["stripe", "cash"],
        // payment_deadline は未指定
      })
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("VALIDATION_ERROR");
      expect(res.error.userMessage).toMatch(
        /オンライン決済を選択した場合、決済締切は必須です|入力内容に誤りがあります。確認して再度お試しください。/
      );
    }
  });

  test("制約: payout_profile_id が無いイベントでは Stripe 追加を fail-close する", async () => {
    const fixture = await createTrackedEvent(getUserA().id, {
      fee: 1000,
      payment_methods: ["cash"],
      withPayoutProfile: true,
      attachPayoutProfileToEvent: false,
    });

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    const res = await updateEventAction(
      fixture.event.id,
      buildFormData({
        payment_methods: ["stripe", "cash"],
        payment_deadline: getFutureDateTimeLocal(24),
      })
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("VALIDATION_ERROR");
      expect(res.error.userMessage).toMatch(/受取先プロファイル|オンライン決済を有効化できません/);
    }
  });

  test("制約: 定員は現在の参加者数未満にできない", async () => {
    const fixture = await createTrackedEventWithParticipants(getUserA().id, { fee: 0 }, 2);

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    const res = await updateEventAction(fixture.event.id, buildFormData({ capacity: "1" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("RESOURCE_CONFLICT");
  });

  test("制約: 締切相関/上限のバリデーション（reg>date, pay<reg, pay>date+30d, grace超過）", async () => {
    const fixture = await createTrackedEvent(getUserA().id, { fee: 0, payment_methods: [] });

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // 開催時刻を +48h に変更
    const newDate = getFutureDateTimeLocal(48);

    // reg > date（エラー）
    let res = await updateEventAction(
      fixture.event.id,
      buildFormData({ date: newDate, registration_deadline: getFutureDateTimeLocal(72) })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("VALIDATION_ERROR");

    // pay < reg（エラー）
    res = await updateEventAction(
      fixture.event.id,
      buildFormData({
        date: newDate,
        registration_deadline: getFutureDateTimeLocal(24),
        payment_deadline: getFutureDateTimeLocal(12),
      })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("VALIDATION_ERROR");

    // pay > date + 30d（エラー）
    const over30d = getFutureDateTimeLocal(60 * 24); // 約60日後相当（十分に超過）
    res = await updateEventAction(
      fixture.event.id,
      buildFormData({ date: newDate, payment_deadline: over30d })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("VALIDATION_ERROR");

    // 猶予で最終支払期限>date+30d（エラー）
    const regOk = getFutureDateTimeLocal(24);
    const payOk = getFutureDateTimeLocal(48); // date(48h後)の直前だが、graceで超過させる
    res = await updateEventAction(
      fixture.event.id,
      buildFormData({
        date: newDate,
        registration_deadline: regOk,
        payment_deadline: payOk,
        allow_payment_after_deadline: true,
        grace_period_days: "31", // 30日だと境界値で許容される場合があるため31日に設定
      })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  test("制約: registration_deadline と payment_deadline の相関バリデーション", async () => {
    const fixture = await createTrackedEvent(getUserA().id, {
      fee: 1000,
      payment_methods: ["stripe"],
      registration_deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1時間後
      payment_deadline: new Date(Date.now() + 120 * 60 * 1000).toISOString(), // 2時間後
      date: new Date(Date.now() + 180 * 60 * 1000).toISOString(), // 3時間後（締切より後）
    });

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // payment_deadline を registration_deadline より前に設定（エラーになるべき）
    const regTime = getFutureDateTimeLocal(120); // 2時間後
    const payTime = getFutureDateTimeLocal(60); // 1時間後（regより前）

    const res = await updateEventAction(
      fixture.event.id,
      buildFormData({
        registration_deadline: regTime,
        payment_deadline: payTime, // reg < pay の制約に違反
      })
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("VALIDATION_ERROR");
      expect(res.error.userMessage).toMatch(
        /決済締切は参加申込締切以降に設定してください|入力内容に誤りがあります。確認して再度お試しください。/
      );
    }
  });

  test("挙動: 未認証だと UNAUTHORIZED", async () => {
    const fixture = await createTrackedEvent(getUserA().id);
    mockGetCurrentCommunityServerActionContext.mockResolvedValueOnce(
      errResult(
        new AppError("UNAUTHORIZED", {
          userMessage: "認証が必要です",
        })
      )
    );

    const { updateEventAction } = await import("@/features/events/actions/update-event");
    const res = await updateEventAction(fixture.event.id, buildFormData({ title: "x" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("UNAUTHORIZED");
  });

  test("挙動: current community 不一致は EVENT_ACCESS_DENIED", async () => {
    const fixture = await createTrackedEvent(getUserA().id);

    mockUpdateActionContext(getUserB().id, "00000000-0000-0000-0000-0000000000bb");
    const { updateEventAction } = await import("@/features/events/actions/update-event");
    const res = await updateEventAction(fixture.event.id, buildFormData({ title: "他人が更新" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("EVENT_ACCESS_DENIED");
  });

  test("挙動: 存在しないIDは EVENT_NOT_FOUND", async () => {
    mockUpdateActionContext(getUserA().id, "00000000-0000-0000-0000-0000000000aa");
    const { updateEventAction } = await import("@/features/events/actions/update-event");
    const res = await updateEventAction(
      "00000000-0000-0000-0000-0000000000aa",
      buildFormData({ title: "x" })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("EVENT_NOT_FOUND");
  });

  test("制約: registration_deadlineの空文字列は変更なしとして扱われる", async () => {
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // テスト用イベントを作成
    const fixture = await createTrackedEvent(getUserA().id, {
      title: "空文字列テスト用イベント",
      fee: 1000,
      payment_methods: ["cash"],
      date: getFutureDateTimeLocal(72), // 締切(60h)より後の日付を設定
      registration_deadline: getFutureDateTimeLocal(60),
    });

    mockUpdateActionContext(getUserA().id, fixture.communityId);
    const res = await updateEventAction(
      fixture.event.id,
      buildFormData({ registration_deadline: "" })
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.message).toBe("変更はありませんでした");
    }
  });
});
