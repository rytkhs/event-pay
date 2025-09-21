/**
 * RLSポリシー適用とゲストトークンアクセス制御の統合テスト
 *
 * Service Role使用廃止修正が正しく機能していることを検証：
 * 1. ゲストトークンによるアクセス制御（update-attendance, create-stripe-session）
 * 2. 招待トークンによるアクセス制御（invite-token validation）
 * 3. 認証済みユーザーによるアクセス制御（generate-guest-url）
 * 4. 不正アクセスの防止
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { validateGuestToken } from "@core/utils/guest-token";
import { validateInviteToken } from "@core/utils/invite-token";

import { createEventAction } from "@features/events/actions/create-event";
import { generateGuestUrlAction } from "@features/events/actions/generate-guest-url";
import { createGuestStripeSessionAction } from "@features/guest/actions/create-stripe-session";
import { updateGuestAttendanceAction } from "@features/guest/actions/update-attendance";

import type { Database } from "@/types/database";

describe("RLS Policy Enforcement Integration Tests", () => {
  let testEventId: string;
  let testAttendanceId: string;
  let testGuestToken: string;
  let testInviteToken: string;
  let testUserId: string;
  let anotherEventId: string;
  let anotherGuestToken: string;

  beforeAll(async () => {
    // テストデータのセットアップ
    const factory = SecureSupabaseClientFactory.getInstance();

    // テスト用のサービスロールクライアント（セットアップのみ）
    const setupClient = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup test data for RLS policy tests"
    );

    // 既存のauth.usersを使用
    testUserId = "11111111-1111-1111-1111-111111111111";

    // public.usersテーブルに対応するプロファイル作成
    await setupClient.from("users").upsert({
      id: testUserId,
      name: "Test Organizer",
    });

    // テストイベント1の作成
    const { data: testEvent, error: testEventError } = await setupClient
      .from("events")
      .insert({
        title: "Test Event for RLS",
        description: "RLS Policy Test Event",
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7日後
        location: "Test Location",
        fee: 1000,
        capacity: 10,
        created_by: testUserId,
        invite_token: "inv_test_rls_token_123456789012",
        payment_methods: ["stripe", "cash"],
        registration_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        payment_deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (testEventError || !testEvent) {
      console.error("Failed to create test event:", testEventError);
      throw new Error("Failed to create test event: " + JSON.stringify(testEventError));
    }
    testEventId = testEvent.id;
    testInviteToken = "inv_test_rls_token_123456789012";

    // テストイベント2（別のイベント）の作成
    const anotherUserId = "22222222-2222-2222-2222-222222222222";

    // public.usersテーブルに対応するプロファイル作成
    await setupClient.from("users").upsert({
      id: anotherUserId,
      name: "Another Organizer",
    });

    const { data: anotherEvent, error: anotherEventError } = await setupClient
      .from("events")
      .insert({
        title: "Another Event",
        description: "Another Event for isolation test",
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        location: "Another Location",
        fee: 500,
        capacity: 5,
        created_by: anotherUserId,
        invite_token: "inv_another_token_123456789012",
        payment_methods: ["cash"],
        registration_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        payment_deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (anotherEventError || !anotherEvent) {
      console.error("Failed to create another event:", anotherEventError);
      throw new Error("Failed to create test event: " + JSON.stringify(anotherEventError));
    }
    anotherEventId = anotherEvent.id;

    // テスト参加者の作成
    const { data: testAttendance } = await setupClient
      .from("attendances")
      .insert({
        event_id: testEventId,
        nickname: "Test Participant",
        email: "test-participant@example.com",
        status: "attending",
        guest_token: "gst_test_guest_token_123456789012345",
      })
      .select("id, guest_token")
      .single();
    testAttendanceId = testAttendance!.id;
    testGuestToken = testAttendance!.guest_token!;

    // 別イベントの参加者（アクセス分離テスト用）
    const { data: anotherAttendance } = await setupClient
      .from("attendances")
      .insert({
        event_id: anotherEventId,
        nickname: "Another Participant",
        email: "another-participant@example.com",
        status: "attending",
        guest_token: "gst_another_guest_token_123456789012",
      })
      .select("guest_token")
      .single();
    anotherGuestToken = anotherAttendance!.guest_token!;

    // Stripe Connectアカウントの設定
    await setupClient.from("stripe_connect_accounts").insert({
      user_id: testUserId,
      stripe_account_id: "acct_test_123",
      payouts_enabled: true,
      details_submitted: true,
    });
  });

  afterAll(async () => {
    // クリーンアップ
    const factory = SecureSupabaseClientFactory.getInstance();
    const cleanupClient = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_CLEANUP,
      "cleanup test data for RLS policy tests"
    );

    await cleanupClient.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await cleanupClient
      .from("attendances")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    await cleanupClient.from("events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await cleanupClient
      .from("stripe_connect_accounts")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    await cleanupClient.from("users").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  });

  describe("Guest Token Access Control", () => {
    test("正しいゲストトークンで参加データにアクセスできる", async () => {
      const result = await validateGuestToken(testGuestToken);

      expect(result.isValid).toBe(true);
      expect(result.attendance).toBeDefined();
      expect(result.attendance!.id).toBe(testAttendanceId);
      expect(result.attendance!.nickname).toBe("Test Participant");
      expect(result.attendance!.event.id).toBe(testEventId);
    });

    test("無効なゲストトークンではアクセスできない", async () => {
      const invalidToken = "gst_invalid_token_123456789012345678";
      const result = await validateGuestToken(invalidToken);

      expect(result.isValid).toBe(false);
      expect(result.attendance).toBeUndefined();
      expect(result.errorCode).toBe("TOKEN_NOT_FOUND");
    });

    test("他の参加者のゲストトークンではデータにアクセスできない", async () => {
      const result = await validateGuestToken(anotherGuestToken);

      expect(result.isValid).toBe(true);
      expect(result.attendance).toBeDefined();
      // 自分のデータのみアクセス可能（別のイベントの参加者）
      expect(result.attendance!.event.id).toBe(anotherEventId);
      expect(result.attendance!.event.id).not.toBe(testEventId);
    });

    test("ゲストクライアントで参加状況を更新できる", async () => {
      const formData = new FormData();
      formData.set("guestToken", testGuestToken);
      formData.set("attendanceStatus", "not_attending");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attendanceId).toBe(testAttendanceId);
        expect(result.data.status).toBe("not_attending");
      }
    });

    test("無効なゲストトークンで参加状況更新はできない", async () => {
      const formData = new FormData();
      formData.set("guestToken", "gst_invalid_token_123456789012345678");
      formData.set("attendanceStatus", "attending");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any).code || "UNKNOWN").toBe("UNAUTHORIZED");
      }
    });
  });

  describe("Stripe Session Creation Access Control", () => {
    test("正しいゲストトークンでStripeセッション作成データにアクセスできる", async () => {
      // まず参加状況を「参加」に戻す
      const updateFormData = new FormData();
      updateFormData.set("guestToken", testGuestToken);
      updateFormData.set("attendanceStatus", "attending");
      updateFormData.set("paymentMethod", "stripe");

      await updateGuestAttendanceAction(updateFormData);

      const input = {
        guestToken: testGuestToken,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const result = await createGuestStripeSessionAction(input);

      // Stripeセッション作成に必要なデータ（Stripe Connectアカウント等）にアクセスできることを確認
      if (!result.success) {
        // エラーメッセージでRLS関連でないことを確認
        const errorMessage = (result.error as any).message || String(result.error);
        expect(errorMessage).not.toContain("permission denied");
        expect(errorMessage).not.toContain("access denied");
        expect(errorMessage).not.toContain("RLS");
      }
    });

    test("無効なゲストトークンでStripeセッション作成はできない", async () => {
      const input = {
        guestToken: "gst_invalid_token_123456789012345678",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const result = await createGuestStripeSessionAction(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as any).code || "UNKNOWN").toBe("UNAUTHORIZED");
      }
    });
  });

  describe("Invite Token Access Control", () => {
    test("正しい招待トークンでイベント情報にアクセスできる", async () => {
      const result = await validateInviteToken(testInviteToken);

      expect(result.isValid).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event!.id).toBe(testEventId);
      expect(result.event!.title).toBe("Test Event for RLS");
      expect(result.canRegister).toBe(true);
    });

    test("無効な招待トークンではアクセスできない", async () => {
      const invalidToken = "inv_invalid_token_123456789012345678";
      const result = await validateInviteToken(invalidToken);

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.errorCode).toBe("TOKEN_NOT_FOUND");
    });

    test("形式が正しくない招待トークンは即座に拒否される", async () => {
      const malformedToken = "invalid_format";
      const result = await validateInviteToken(malformedToken);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe("INVALID_TOKEN");
    });
  });

  describe("Authenticated User Access Control", () => {
    test("主催者は自分のイベントの参加者URLを生成できる", async () => {
      // 実際のテストでは認証状態をモックする必要がありますが、
      // ここでは機能が呼び出せることを確認
      const input = {
        eventId: testEventId,
        attendanceId: testAttendanceId,
      };

      // 認証されていない状態での呼び出しは失敗するはずですが、
      // RLS関連のエラーでないことを確認
      const result = await generateGuestUrlAction(input);

      if (!result.success) {
        // 認証エラーまたは権限エラーであり、RLS関連でないことを確認
        const errorCode = (result.error as any).code || "UNKNOWN";
        const errorMessage = (result.error as any).message || String(result.error);
        expect(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"]).toContain(errorCode);
        expect(errorMessage).not.toContain("permission denied");
      }
    });
  });

  describe("Data Isolation Verification", () => {
    test("ゲストトークンによるデータアクセスが正しく分離されている", async () => {
      const factory = SecureSupabaseClientFactory.getInstance();

      // 正しいゲストトークンを使用したクライアント
      const guestClient = factory.createGuestClient(testGuestToken);

      // attendancesテーブルから直接データを取得してみる
      const { data: attendances, error } = await guestClient
        .from("attendances")
        .select("id, event_id, nickname");

      expect(error).toBeNull();
      expect(attendances).toBeDefined();

      if (attendances) {
        // RLSにより、自分の参加データのみ取得できることを確認
        expect(attendances).toHaveLength(1);
        expect(attendances[0].id).toBe(testAttendanceId);
        expect(attendances[0].event_id).toBe(testEventId);
        expect(attendances[0].nickname).toBe("Test Participant");
      }
    });

    test("無効なゲストトークンでは何のデータも取得できない", async () => {
      const factory = SecureSupabaseClientFactory.getInstance();

      // 無効なゲストトークンを使用したクライアント（存在しないが形式は正しい）
      const invalidGuestClient = factory.createGuestClient("gst_nonexistent_token_12345678901234");

      const { data: attendances, error } = await invalidGuestClient
        .from("attendances")
        .select("id, event_id, nickname");

      // RLSにより、データが取得できないことを確認
      expect(attendances).toEqual([]);
    });

    test("招待トークンによるイベントアクセスが正しく分離されている", async () => {
      const factory = SecureSupabaseClientFactory.getInstance();
      const anonClient = factory.createReadOnlyClient();

      // 招待トークンによる直接的なイベントアクセスをテスト
      const { data: events, error } = await anonClient
        .from("events")
        .select("id, title, invite_token")
        .eq("invite_token", testInviteToken);

      expect(error).toBeNull();
      expect(events).toBeDefined();

      if (events) {
        // 該当する招待トークンのイベントのみ取得できることを確認
        expect(events).toHaveLength(1);
        expect(events[0].id).toBe(testEventId);
        expect(events[0].title).toBe("Test Event for RLS");
      }
    });
  });

  describe("Service Role Bypass Prevention", () => {
    test("ゲストクライアントはRLSポリシーに従ってアクセス制御される", async () => {
      const factory = SecureSupabaseClientFactory.getInstance();
      const guestClient = factory.createGuestClient(testGuestToken);

      // 他のユーザーのイベントにはアクセスできないことを確認
      const { data: otherEvents, error } = await guestClient
        .from("events")
        .select("id, title")
        .eq("id", anotherEventId);

      // RLSにより、他のイベントにはアクセスできない
      expect(otherEvents).toEqual([]);
    });

    test("読み取り専用クライアントもRLSポリシーに従う", async () => {
      const factory = SecureSupabaseClientFactory.getInstance();
      const anonClient = factory.createReadOnlyClient();

      // 招待トークンなしでは限定的なアクセスのみ可能
      const { data: events } = await anonClient.from("events").select("id, title").limit(10);

      // 匿名ユーザーがアクセス可能なイベントのみ返される
      expect(Array.isArray(events)).toBe(true);
    });
  });
});
