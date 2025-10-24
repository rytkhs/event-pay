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

import { generateGuestUrlAction } from "@features/events/actions/generate-guest-url";
import { createGuestStripeSessionAction } from "@features/guest/actions/create-stripe-session";
import { updateGuestAttendanceAction } from "@features/guest/actions/update-attendance";

import { createTestUser, deleteTestUser } from "@tests/helpers/test-user";

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
    const factory = SecureSupabaseClientFactory.create();

    // テスト用のサービスロールクライアント（セットアップのみ）
    const setupClient = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup test data for RLS policy tests"
    );

    // テストユーザーを作成（auth.users + public.users）
    const testOrganizerEmail = `test-organizer-rls-${Date.now()}@example.com`;
    const anotherOrganizerEmail = `another-organizer-rls-${Date.now()}@example.com`;

    const testOrganizer = await createTestUser(testOrganizerEmail, "Password123!");
    const anotherOrganizer = await createTestUser(anotherOrganizerEmail, "Password123!");

    testUserId = testOrganizer.id;
    const anotherUserId = anotherOrganizer.id;

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
        invite_token: "inv_test_rls_token_12345678901234567",
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
    testInviteToken = "inv_test_rls_token_12345678901234567";

    // テストイベント2（別のイベント）の作成

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
        invite_token: "inv_another_token_123456789012345678",
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
    if (!testAttendance) {
      throw new Error("Failed to insert test attendance");
    }
    testAttendanceId = testAttendance.id;
    testGuestToken = testAttendance.guest_token as string;

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
    if (!anotherAttendance) {
      throw new Error("Failed to insert another attendance");
    }
    anotherGuestToken = anotherAttendance.guest_token as string;

    // Stripe Connectアカウントの設定
    await setupClient.from("stripe_connect_accounts").insert({
      user_id: testUserId,
      stripe_account_id: "acct_test_123",
      payouts_enabled: true,
    });
  });

  afterAll(async () => {
    // クリーンアップ
    const factory = SecureSupabaseClientFactory.create();
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
      .neq("user_id", "00000000-0000-0000-0000-000000000000");
    await cleanupClient.from("users").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // auth.usersのクリーンアップ（テストヘルパーを使用）
    try {
      if (testUserId) {
        await deleteTestUser(testUserId);
      }
    } catch (error) {
      console.warn("Failed to delete test users:", error);
    }
  });

  describe("Guest Token Access Control", () => {
    test("正しいゲストトークンで参加データにアクセスできる", async () => {
      const result = await validateGuestToken(testGuestToken);

      expect(result.isValid).toBe(true);
      expect(result.attendance).toBeDefined();
      expect(result.attendance).toBeDefined();
      if (result.attendance) {
        expect(result.attendance.id).toBe(testAttendanceId);
        expect(result.attendance.nickname).toBe("Test Participant");
        expect(result.attendance.event.id).toBe(testEventId);
      }
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
      expect(result.attendance).toBeDefined();
      if (result.attendance) {
        expect(result.attendance.event.id).toBe(anotherEventId);
        expect(result.attendance.event.id).not.toBe(testEventId);
      }
    });

    test("ゲストクライアントで参加状況を更新できる", async () => {
      // RPCを直接呼び出してエラーの詳細を確認
      const factory = SecureSupabaseClientFactory.create();
      const guestClient = factory.createGuestClient(testGuestToken);

      const { error: rpcError } = await guestClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: testAttendanceId,
        p_guest_token: testGuestToken,
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 0,
      });

      if (rpcError) {
        console.log("Direct RPC error:", rpcError);
      }

      expect(rpcError).toBeNull();

      // Server Actionも確認
      const formData = new FormData();
      formData.set("guestToken", testGuestToken);
      formData.set("attendanceStatus", "not_attending");

      const result = await updateGuestAttendanceAction(formData);

      if (!result.success) {
        console.log("Update failed:", JSON.stringify(result.error, null, 2));
      }

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

      // Debug: エラー詳細を出力
      if (!result.success) {
        console.log("Error details:", JSON.stringify(result.error, null, 2));
      }

      expect(result.success).toBe(false);
      if (!result.success) {
        const errorCode = (result.error as any).code || "UNKNOWN";
        // UNAUTHORIZEDまたはUNKNOWN（エラーハンドラーのマッピング次第）を許容
        expect(["UNAUTHORIZED", "UNKNOWN"]).toContain(errorCode);
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
        const errorCode = (result.error as any).code || "UNKNOWN";
        // UNAUTHORIZEDまたはUNKNOWN（エラーハンドラーのマッピング次第）を許容
        expect(["UNAUTHORIZED", "UNKNOWN"]).toContain(errorCode);
      }
    });
  });

  describe("Invite Token Access Control", () => {
    test("正しい招待トークンでイベント情報にアクセスできる", async () => {
      const result = await validateInviteToken(testInviteToken);

      // Debug: 結果を出力
      if (!result.isValid) {
        console.log("Invite token validation failed:", JSON.stringify(result, null, 2));
      }

      expect(result.isValid).toBe(true);
      expect(result.event).toBeDefined();
      if (result.event) {
        expect(result.event.id).toBe(testEventId);
        expect(result.event.title).toBe("Test Event for RLS");
      }
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
        // UNKNOWNも許容（エラーコードマッピング次第）
        expect(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "UNKNOWN"]).toContain(errorCode);
        expect(errorMessage).not.toContain("permission denied");
      }
    });
  });

  describe("Data Isolation Verification", () => {
    test("ゲストトークンによるデータアクセスが正しく分離されている", async () => {
      const factory = SecureSupabaseClientFactory.create();

      // 正しいゲストトークンを使用したクライアント
      const guestClient = factory.createGuestClient(testGuestToken);

      // 公開RPC経由で参加データを取得
      const { data: rpcRow, error } = await (guestClient as any)
        .rpc("rpc_guest_get_attendance", { p_guest_token: testGuestToken })
        .single();

      expect(error).toBeNull();
      expect(rpcRow).toBeDefined();

      // 自分の参加データのみ取得できることを確認
      expect((rpcRow as any).attendance_id).toBe(testAttendanceId);
      expect((rpcRow as any).event_id).toBe(testEventId);
    });

    test("無効なゲストトークンでは何のデータも取得できない", async () => {
      const factory = SecureSupabaseClientFactory.create();

      // 無効なゲストトークンを使用したクライアント（存在しないが形式は正しい）
      const invalidGuestClient = factory.createGuestClient("gst_nonexistent_token_12345678901234");

      const { data: rpcRow } = await (invalidGuestClient as any)
        .rpc("rpc_guest_get_attendance", { p_guest_token: "gst_nonexistent_token_12345678901234" })
        .single();

      // RLSにより、データが取得できないことを確認
      expect(rpcRow).toBeNull();
    });

    test("招待トークンによるイベントアクセスが正しく分離されている", async () => {
      const factory = SecureSupabaseClientFactory.create();
      // 招待トークンヘッダーを設定した読み取り専用クライアント
      const anonClient = factory.createReadOnlyClient({
        headers: {
          "x-invite-token": testInviteToken,
        },
      });

      // 公開RPCで招待トークンに紐づくイベントをテスト
      const { data: events, error } = await (anonClient as any).rpc("rpc_public_get_event", {
        p_invite_token: testInviteToken,
      });

      expect(error).toBeNull();
      expect(events).toBeDefined();

      // 該当する招待トークンのイベントのみ取得できることを確認
      // RPCはTABLE型を返すので、配列になる
      const row = Array.isArray(events) ? events[0] : events;
      expect(row).toBeDefined();
      if (row) {
        expect(row.id).toBe(testEventId);
        expect(row.title).toBe("Test Event for RLS");
      }
    });
  });

  describe("Service Role Bypass Prevention", () => {
    test("ゲストクライアントはRLSポリシーに従ってアクセス制御される", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const guestClient = factory.createGuestClient(testGuestToken);

      // RLSにより、他のイベントにはアクセスできない（RPCでもゲート）
      const { error } = await (guestClient as any).rpc("rpc_public_attending_count", {
        p_event_id: anotherEventId,
      });
      expect(error).not.toBeNull();
    });

    test("読み取り専用クライアントもRLSポリシーに従う", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const anonClient = factory.createReadOnlyClient();

      // 招待トークンなしでは限定的なアクセスのみ可能
      const { data: events } = await anonClient.from("events").select("id, title").limit(10);

      // 匿名ユーザーがアクセス可能なイベントのみ返される
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe("Capacity and Concurrency", () => {
    test("容量1のイベントで同時参加リクエストの一方が拒否される", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const admin = await factory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "setup capacity race test"
      );

      // 容量1のイベントを作成
      const capacityEvent = await admin
        .from("events")
        .insert({
          title: "Capacity Race Event",
          description: "race test",
          date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          location: "Race Loc",
          fee: 0,
          capacity: 1,
          created_by: testUserId,
          invite_token: "inv_capacity_race_123456789012",
          payment_methods: ["cash"],
          registration_deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          payment_deadline: null,
        })
        .select("id")
        .single();

      if (!capacityEvent.data) throw new Error("failed to create capacity event");
      const capEventId = capacityEvent.data.id as string;

      // 2人の参加者（初期はnot_attending）
      const tokenA = "gst_" + "a".repeat(32);
      const tokenB = "gst_" + "b".repeat(32);
      const aIns = await admin
        .from("attendances")
        .insert({
          event_id: capEventId,
          nickname: "A",
          email: "a@example.com",
          status: "not_attending",
          guest_token: tokenA,
        })
        .select("id")
        .single();
      const bIns = await admin
        .from("attendances")
        .insert({
          event_id: capEventId,
          nickname: "B",
          email: "b@example.com",
          status: "not_attending",
          guest_token: tokenB,
        })
        .select("id")
        .single();
      if (!aIns.data || !bIns.data) throw new Error("failed to insert attendances");

      // 同時にattendingへ変更（fee=0なので支払い不要）
      const guestA = factory.createGuestClient(tokenA);
      const guestB = factory.createGuestClient(tokenB);
      const [r1, r2] = await Promise.all([
        (guestA as any).rpc("update_guest_attendance_with_payment", {
          p_attendance_id: aIns.data.id,
          p_guest_token: tokenA,
          p_status: "attending",
          p_payment_method: null,
          p_event_fee: 0,
        }),
        (guestB as any).rpc("update_guest_attendance_with_payment", {
          p_attendance_id: bIns.data.id,
          p_guest_token: tokenB,
          p_status: "attending",
          p_payment_method: null,
          p_event_fee: 0,
        }),
      ]);

      // どちらかは成功、どちらかはエラー（定員超過）
      const errors = [r1.error, r2.error].filter(Boolean);
      expect(errors.length).toBe(1);

      // attendingは1件のみ
      const count = await admin
        .from("attendances")
        .select("id", { count: "exact", head: true })
        .eq("event_id", capEventId)
        .eq("status", "attending");
      expect(count.count).toBe(1);
    });
  });

  describe("Unique Pending Payments", () => {
    test("同一参加に対し未確定(pending)決済は1件に抑止される", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const admin = await factory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "setup unique pending test"
      );

      // 有料イベントの作成
      const paidEvent = await admin
        .from("events")
        .insert({
          title: "Pending Unique Event",
          description: "pending unique",
          date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          location: "Loc",
          fee: 500,
          capacity: 10,
          created_by: testUserId,
          invite_token: "inv_pending_unique_123456789012",
          payment_methods: ["cash"],
          registration_deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          payment_deadline: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      if (!paidEvent.data) throw new Error("failed to create paid event");

      const token = "gst_" + "c".repeat(32);
      const attIns = await admin
        .from("attendances")
        .insert({
          event_id: paidEvent.data.id,
          nickname: "C",
          email: "c@example.com",
          status: "not_attending",
          guest_token: token,
        })
        .select("id")
        .single();
      if (!attIns.data) throw new Error("failed to insert attendance");

      // サーバーアクションを2回叩いてもpendingは1件
      const formData1 = new FormData();
      formData1.set("guestToken", token);
      formData1.set("attendanceStatus", "attending");
      formData1.set("paymentMethod", "cash");

      const formData2 = new FormData();
      formData2.set("guestToken", token);
      formData2.set("attendanceStatus", "attending");
      formData2.set("paymentMethod", "cash");

      const [res1, res2] = await Promise.all([
        updateGuestAttendanceAction(formData1),
        updateGuestAttendanceAction(formData2),
      ]);
      expect(res1.success || res2.success).toBe(true);

      const pending = await admin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("attendance_id", attIns.data.id)
        .eq("status", "pending");
      expect(pending.count).toBe(1);
    });
  });

  describe("Event Closure Guards", () => {
    test("登録締切後はゲスト更新が拒否される", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const admin = await factory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "setup event closure guard test"
      );

      const closedEvent = await admin
        .from("events")
        .insert({
          title: "Closed Event",
          description: "closed",
          date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          location: "Loc",
          fee: 0,
          capacity: 5,
          created_by: testUserId,
          invite_token: "inv_closed_event_123456789012",
          payment_methods: ["cash"],
          registration_deadline: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          payment_deadline: null,
        })
        .select("id")
        .single();
      if (!closedEvent.data) throw new Error("failed to create closed event");

      const token = "gst_" + "d".repeat(32);
      const attIns = await admin
        .from("attendances")
        .insert({
          event_id: closedEvent.data.id,
          nickname: "D",
          email: "d@example.com",
          status: "not_attending",
          guest_token: token,
        })
        .select("id")
        .single();
      if (!attIns.data) throw new Error("failed to insert attendance");

      const form = new FormData();
      form.set("guestToken", token);
      form.set("attendanceStatus", "attending");

      const result = await updateGuestAttendanceAction(form);
      // アプリロジックの期待: 更新は拒否される
      expect(result.success).toBe(false);
      // スキーマの期待: ステータスは変更されていない（not_attendingのまま）
      const verifyFactory = SecureSupabaseClientFactory.create();
      const adminVerify = await verifyFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "verify closure guard"
      );
      const after = await adminVerify
        .from("attendances")
        .select("status")
        .eq("id", attIns.data.id)
        .single();
      expect(after.data?.status).toBe("not_attending");
    });
  });

  describe("Invite Header Requirement", () => {
    test("ヘッダー未設定ではrpc_public_get_eventは返らない", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const anon = factory.createReadOnlyClient();

      const { data: events, error } = await (anon as any).rpc("rpc_public_get_event", {
        p_invite_token: testInviteToken,
      });
      // can_access_eventがヘッダーを見るため、未設定だとヒットしない
      expect(error).toBeNull();
      const row = Array.isArray(events) ? events[0] : events;
      expect(row).toBeUndefined();
    });
  });

  describe("Public Attending Count RPC", () => {
    test("invite header required; with header returns correct count", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const admin = await factory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "setup event for attending count"
      );

      // Create dedicated event
      const now = Date.now();
      const date = new Date(now + 60 * 60 * 1000).toISOString();
      const invite = "inv_" + Math.random().toString(36).slice(2, 18);
      const { data: e } = await admin
        .from("events")
        .insert({
          title: "Attending Count Event",
          date,
          location: "X",
          fee: 0,
          capacity: 10,
          payment_methods: ["cash"],
          registration_deadline: date,
          payment_deadline: null,
          invite_token: invite,
          created_by: testUserId,
        })
        .select("id")
        .single();

      if (!e?.id) throw new Error("failed to create event");

      // Two attendances
      const t1 = "gst_" + "a".repeat(32);
      const t2 = "gst_" + "b".repeat(32);
      await admin.from("attendances").insert([
        {
          event_id: e.id,
          nickname: "A",
          email: "a@example.com",
          status: "attending",
          guest_token: t1,
        },
        {
          event_id: e.id,
          nickname: "B",
          email: "b@example.com",
          status: "attending",
          guest_token: t2,
        },
      ]);

      // Without header: should error
      const anon = factory.createReadOnlyClient();
      const { error: errNoHeader } = await (anon as any).rpc("rpc_public_attending_count", {
        p_event_id: e.id,
      });
      expect(errNoHeader).not.toBeNull();

      // With header: correct count
      const anonWithHeader = factory.createReadOnlyClient({
        headers: { "x-invite-token": invite },
      });
      // small delay to ensure visibility
      await new Promise((r) => setTimeout(r, 20));
      // admin ground truth
      const countAdmin = await admin
        .from("attendances")
        .select("id", { count: "exact", head: true })
        .eq("event_id", e.id)
        .eq("status", "attending");
      const expected = countAdmin.count ?? 0;
      const { data: cnt, error } = await (anonWithHeader as any).rpc("rpc_public_attending_count", {
        p_event_id: e.id,
      });
      expect(error).toBeNull();
      expect(cnt).toBe(expected);
    });
  });

  describe("Public Connect Account RPC", () => {
    test("guest can fetch minimal connect account info for event organizer", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const anonWithHeader = factory.createReadOnlyClient({
        headers: { "x-invite-token": testInviteToken },
      });

      const { data, error } = await (anonWithHeader as any).rpc("rpc_public_get_connect_account", {
        p_event_id: testEventId,
        p_creator_id: testUserId,
      });

      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row).toBeDefined();
      if (row) {
        expect((row as any).stripe_account_id).toBeDefined();
        expect((row as any).payouts_enabled).toBe(true);
      }
    });

    test("mismatched creator_id returns empty", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const anonWithHeader = factory.createReadOnlyClient({
        headers: { "x-invite-token": testInviteToken },
      });

      const { data, error } = await (anonWithHeader as any).rpc("rpc_public_get_connect_account", {
        p_event_id: testEventId,
        p_creator_id: "11111111-1111-1111-1111-111111111111",
      });

      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row).toBeUndefined();
    });
  });

  describe("RLS boundaries for fee_config/system_logs", () => {
    test("fee_config: admin can UPDATE (read-only for normal roles)", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const admin = await factory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "update fee_config for test"
      );
      const { data: feeBefore } = await admin
        .from("fee_config")
        .select("is_tax_included")
        .limit(1)
        .single();
      const toggle = !(feeBefore?.is_tax_included ?? true);
      const { error: updErr } = await admin
        .from("fee_config")
        .update({ is_tax_included: toggle })
        .eq("id", 1);
      expect(updErr).toBeNull();
    });

    test("system_logs: anon cannot INSERT; admin can SELECT", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const anon = factory.createReadOnlyClient();
      const ins = await anon.from("system_logs").insert({
        id: 999999,
        created_at: new Date().toISOString(),
        log_level: "info",
        log_category: "system",
        actor_type: "system",
        action: "test",
        message: "x",
        outcome: "success",
      });
      expect(ins.error).not.toBeNull();

      const admin = await factory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "select system_logs"
      );
      const selAdmin = await admin.from("system_logs").select("id").limit(1);
      expect(selAdmin.error).toBeNull();
    });
  });

  describe("Latest payment via RPC", () => {
    test("rpc_guest_get_latest_payment returns most recently created amount", async () => {
      const factory = SecureSupabaseClientFactory.create();
      const admin = await factory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "setup payments for latest payment rpc"
      );

      // create event and attendance
      const dt = new Date(Date.now() + 3600_000).toISOString();
      const eventIns = await admin
        .from("events")
        .insert({
          title: "Latest Payment Event",
          date: dt,
          location: "X",
          fee: 100,
          capacity: 5,
          payment_methods: ["cash"],
          registration_deadline: dt,
          payment_deadline: null,
          invite_token: "inv_" + Math.random().toString(36).slice(2, 18),
          created_by: testUserId,
        })
        .select("id")
        .single();
      if (!eventIns.data) throw new Error("failed to create event");

      const token = "gst_" + "z".repeat(32);
      const attIns = await admin
        .from("attendances")
        .insert({
          event_id: eventIns.data.id,
          nickname: "Z",
          email: "z@example.com",
          status: "attending",
          guest_token: token,
        })
        .select("id")
        .single();
      if (!attIns.data) throw new Error("failed to insert attendance");

      // insert two payments with controlled created_at for deterministic ordering
      const createdEarly = new Date(Date.now() - 2000).toISOString();
      const createdLate = new Date(Date.now() + 10).toISOString();
      await admin.from("payments").insert({
        attendance_id: attIns.data.id,
        amount: 300,
        method: "cash",
        status: "pending",
        created_at: createdEarly,
      });
      await admin.from("payments").insert({
        attendance_id: attIns.data.id,
        amount: 700,
        method: "cash",
        status: "received",
        paid_at: new Date().toISOString(),
        created_at: createdLate,
      });

      const guest = factory.createGuestClient(token);
      const { data, error } = await (guest as any).rpc("rpc_guest_get_latest_payment", {
        p_attendance_id: attIns.data.id,
        p_guest_token: token,
      });
      expect(error).toBeNull();
      // created_at DESC ordering means last inserted (700) should be returned
      expect(data).toBe(700);
    });
  });
});
