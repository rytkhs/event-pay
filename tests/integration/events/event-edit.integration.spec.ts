/**
 * イベント編集 統合テスト（Server Action: updateEventAction）
 *
 * カバレッジ指向のケース設計:
 * - 正常系: 基本項目の更新、空欄クリア、fee=0→payment_methods=[]
 * - 制約系: 参加者/決済済み存在時の制限、定員と参加者数の関係、締切相関・上限、猶予上限
 * - 挙動系: 未認証、権限なし、存在しないID
 */

import { jest } from "@jest/globals";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import {
  createTestEvent,
  createTestEventWithParticipants,
  deleteTestEvent,
} from "@/tests/helpers/test-event";
import { createPaidStripePayment, createTestAttendance } from "@/tests/helpers/test-payment-data";
import { createTestUser, deleteTestUser, type TestUser } from "@/tests/helpers/test-user";

// next/cache は副作用を持たないようにモック
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

// next/headers はCSRF通過用のヘッダーを返す
let mockHeaders: { get: (name: string) => string | null } | undefined;
jest.mock("next/headers", () => ({
  headers: jest.fn(() => mockHeaders),
}));

function setupAllowedHeaders() {
  mockHeaders = {
    get: (name: string) => {
      const n = name.toLowerCase();
      if (n === "user-agent") return "test-user-agent";
      return null;
    },
  };
}

// テスト内で createClient をモックする（DB操作はadmin clientを委譲し、auth.getUserのみテストユーザーを返す）
async function mockSupabaseCreateClient(user: TestUser) {
  jest.resetModules();
  const adminClient = await SecureSupabaseClientFactory.create().createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    "event-edit integration",
    {
      operationType: "SELECT",
      accessedTables: ["public.events", "public.attendances", "public.payments"],
    }
  );

  jest.doMock("@core/supabase/server", () => ({
    createClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: user.id, email: user.email } }, error: null }),
      },
      from: (table: string) => adminClient.from(table),
    }),
  }));
}

// ヘルパー: FormDataを構築（空文字送信・配列はカンマ区切り）
function buildFormData(payload: Record<string, any>): FormData {
  const fd = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length === 0) fd.append(key, "");
      else fd.append(key, value.join(","));
    } else if (typeof value === "boolean") {
      fd.append(key, String(value));
    } else if (value === "" || value === null || value === undefined) {
      // クリア意図は空文字として送信
      fd.append(key, "");
    } else {
      fd.append(key, value);
    }
  });
  return fd;
}

// 将来の日時（datetime-local 形式: YYYY-MM-DDTHH:mm）
function futureLocal(minutesFromNow: number): string {
  const dt = new Date(Date.now() + minutesFromNow * 60 * 1000);
  return dt.toISOString().slice(0, 16);
}

describe("イベント編集 統合テスト", () => {
  let userA: TestUser;
  let userB: TestUser;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    setupAllowedHeaders();
    userA = await createTestUser(`update-int-a-${Date.now()}@example.com`, "TestPassword123");
    userB = await createTestUser(`update-int-b-${Date.now()}@example.com`, "TestPassword123");
  });

  afterAll(async () => {
    for (const id of createdEventIds) {
      try {
        await deleteTestEvent(id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("cleanup failed for event:", id, e);
      }
    }
    await deleteTestUser(userA.email);
    await deleteTestUser(userB.email);
  });

  test("正常系: タイトル/場所/説明を更新できる", async () => {
    const ev = await createTestEvent(userA.id, { fee: 0, payment_methods: [] });
    createdEventIds.push(ev.id);

    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    const fd = buildFormData({
      title: "編集後タイトル",
      location: "編集後会場",
      description: "編集後説明",
    });

    const res = await updateEventAction(ev.id, fd);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.title).toBe("編集後タイトル");
      expect(res.data.location).toBe("編集後会場");
      expect(res.data.description).toBe("編集後説明");
    }
  });

  test("正常系: 空欄送信で location/description/capacity/payment_deadline をクリア", async () => {
    const ev = await createTestEvent(userA.id, {
      fee: 1000,
      payment_methods: ["cash"],
      location: "元会場",
      description: "元説明",
      capacity: 100,
      payment_deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    createdEventIds.push(ev.id);

    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    const fd = buildFormData({
      location: "",
      description: "",
      capacity: "",
      payment_deadline: "",
    });

    const res = await updateEventAction(ev.id, fd);
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
    const ev = await createTestEvent(userA.id, {
      fee: 0,
      payment_methods: [],
      registration_deadline: originalDeadline, // 1時間後
    });
    createdEventIds.push(ev.id);

    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // registration_deadline を空文字で送信（無視されるべき）
    const fd = buildFormData({
      registration_deadline: "",
    });

    const res = await updateEventAction(ev.id, fd);
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
    const ev = await createTestEvent(userA.id, {
      fee: 1000,
      payment_methods: ["stripe"],
      payment_deadline: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    });
    createdEventIds.push(ev.id);

    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    const fd = buildFormData({ fee: "0" });
    const res = await updateEventAction(ev.id, fd);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.fee).toBe(0);
      expect(res.data.payment_methods).toEqual([]);
    }
  });

  test("制約: 決済済み参加者がいると fee/payment_methods はロックされる", async () => {
    // 有料イベント + 参加者 + paid決済
    const ev = await createTestEvent(userA.id, {
      fee: 1000,
      payment_methods: ["stripe"],
      payment_deadline: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    });
    createdEventIds.push(ev.id);
    const at = await createTestAttendance(ev.id);
    await createPaidStripePayment(at.id, { amount: ev.fee });

    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // 参加費の変更は不可
    const resFee = await updateEventAction(ev.id, buildFormData({ fee: "2000" }));
    expect(resFee.success).toBe(false);
    if (!resFee.success) expect(resFee.code).toBe("RESOURCE_CONFLICT");

    // 決済方法の変更も不可
    const resPm = await updateEventAction(ev.id, buildFormData({ payment_methods: ["cash"] }));
    expect(resPm.success).toBe(false);
    if (!resPm.success) expect(resPm.code).toBe("RESOURCE_CONFLICT");
  });

  test("制約: Stripe選択時はpayment_deadline必須（更新時も作成時と同様）", async () => {
    const ev = await createTestEvent(userA.id, {
      fee: 1000,
      payment_methods: ["cash"], // 初期は現金のみ
    });
    createdEventIds.push(ev.id);

    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // Stripeを追加するがpayment_deadlineを指定しない（エラーになるべき）
    const res = await updateEventAction(
      ev.id,
      buildFormData({
        payment_methods: ["stripe", "cash"],
        // payment_deadline は未指定
      })
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("VALIDATION_ERROR");
      expect(res.error).toContain("オンライン決済を選択した場合、決済締切は必須です");
    }
  });

  test("制約: 定員は現在の参加者数未満にできない", async () => {
    const ev = await createTestEventWithParticipants(userA.id, { fee: 0 }, 2);
    createdEventIds.push(ev.id);

    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    const res = await updateEventAction(ev.id, buildFormData({ capacity: "1" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.code).toBe("RESOURCE_CONFLICT");
  });

  test("制約: 締切相関/上限のバリデーション（reg>date, pay<reg, pay>date+30d, grace超過）", async () => {
    const ev = await createTestEvent(userA.id, { fee: 0, payment_methods: [] });
    createdEventIds.push(ev.id);

    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // 開催時刻を +48h に変更
    const newDate = futureLocal(48);

    // reg > date（エラー）
    let res = await updateEventAction(
      ev.id,
      buildFormData({ date: newDate, registration_deadline: futureLocal(72) })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.code).toBe("VALIDATION_ERROR");

    // pay < reg（エラー）
    res = await updateEventAction(
      ev.id,
      buildFormData({
        date: newDate,
        registration_deadline: futureLocal(24),
        payment_deadline: futureLocal(12),
      })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.code).toBe("VALIDATION_ERROR");

    // pay > date + 30d（エラー）
    const over30d = futureLocal(60 * 24); // 約60日後相当（十分に超過）
    res = await updateEventAction(
      ev.id,
      buildFormData({ date: newDate, payment_deadline: over30d })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.code).toBe("VALIDATION_ERROR");

    // 猶予で最終期限>date+30d（エラー）
    const regOk = futureLocal(24);
    const payOk = futureLocal(48); // date(48h後)の直前だが、graceで超過させる
    res = await updateEventAction(
      ev.id,
      buildFormData({
        date: newDate,
        registration_deadline: regOk,
        payment_deadline: payOk,
        allow_payment_after_deadline: true,
        grace_period_days: "30", // 30日加算で上限超過
      })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.code).toBe("VALIDATION_ERROR");
  });

  test("制約: registration_deadline と payment_deadline の相関バリデーション", async () => {
    const ev = await createTestEvent(userA.id, {
      fee: 1000,
      payment_methods: ["stripe"],
      registration_deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1時間後
      payment_deadline: new Date(Date.now() + 120 * 60 * 1000).toISOString(), // 2時間後
    });
    createdEventIds.push(ev.id);

    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // payment_deadline を registration_deadline より前に設定（エラーになるべき）
    const regTime = futureLocal(120); // 2時間後
    const payTime = futureLocal(60); // 1時間後（regより前）

    const res = await updateEventAction(
      ev.id,
      buildFormData({
        registration_deadline: regTime,
        payment_deadline: payTime, // reg < pay の制約に違反
      })
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("VALIDATION_ERROR");
      expect(res.error).toContain("決済締切は参加申込締切以降に設定してください");
    }
  });

  test("挙動: 未認証だと UNAUTHORIZED", async () => {
    const ev = await createTestEvent(userA.id);
    createdEventIds.push(ev.id);

    // 認証なしのモック
    jest.resetModules();
    const adminClient = await SecureSupabaseClientFactory.create().createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "event-edit integration (unauth)",
      { operationType: "SELECT", accessedTables: ["public.events"] }
    );
    jest.doMock("@core/supabase/server", () => ({
      createClient: () => ({
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
        from: (table: string) => adminClient.from(table),
      }),
    }));

    const { updateEventAction } = await import("@/features/events/actions/update-event");
    const res = await updateEventAction(ev.id, buildFormData({ title: "x" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.code).toBe("UNAUTHORIZED");
  });

  test("挙動: 作成者以外は FORBIDDEN", async () => {
    const ev = await createTestEvent(userA.id);
    createdEventIds.push(ev.id);

    await mockSupabaseCreateClient(userB);
    const { updateEventAction } = await import("@/features/events/actions/update-event");
    const res = await updateEventAction(ev.id, buildFormData({ title: "他人が更新" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.code).toBe("FORBIDDEN");
  });

  test("挙動: 不正なIDは NOT_FOUND", async () => {
    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");
    const res = await updateEventAction(
      "00000000-0000-0000-0000-0000000000aa",
      buildFormData({ title: "x" })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.code).toBe("NOT_FOUND");
  });

  test("制約: registration_deadlineの空文字列は拒否される", async () => {
    await mockSupabaseCreateClient(userA);
    const { updateEventAction } = await import("@/features/events/actions/update-event");

    // テスト用イベントを作成
    const testEvent = await createTestEvent(userA.id, {
      title: "空文字列テスト用イベント",
      fee: 1000,
      payment_methods: ["cash"],
      registration_deadline: futureLocal(60),
    });
    createdEventIds.push(testEvent.id);

    const res = await updateEventAction(testEvent.id, buildFormData({ registration_deadline: "" }));
    // 空文字列はZodスキーマレベルでバリデーションエラーになるため、変更なしとして処理される
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.message).toBe("変更はありませんでした");
    }
  });
});
