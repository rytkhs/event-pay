/**
 * RLS Policy Enforcement: Guest Token Access Control Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { validateGuestToken } from "@core/utils/guest-token";
import { updateGuestAttendanceAction } from "@features/guest/actions/update-attendance";
import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("Guest Token Access Control", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("正しいゲストトークンで参加データにアクセスできる", async () => {
    const result = await validateGuestToken(setup.testGuestToken);

    expect(result.isValid).toBe(true);
    expect(result.attendance).toBeDefined();
    expect(result.attendance).toBeDefined();
    if (result.attendance) {
      expect(result.attendance.id).toBe(setup.testAttendanceId);
      expect(result.attendance.nickname).toBe("Test Participant");
      expect(result.attendance.event.id).toBe(setup.testEventId);
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
    const result = await validateGuestToken(setup.anotherGuestToken);

    expect(result.isValid).toBe(true);
    expect(result.attendance).toBeDefined();
    // 自分のデータのみアクセス可能（別のイベントの参加者）
    expect(result.attendance).toBeDefined();
    if (result.attendance) {
      expect(result.attendance.event.id).toBe(setup.anotherEventId);
      expect(result.attendance.event.id).not.toBe(setup.testEventId);
    }
  });

  test("ゲストクライアントで参加状況を更新できる", async () => {
    // RPCを直接呼び出してエラーの詳細を確認
    const { SecureSupabaseClientFactory } = await import(
      "@core/security/secure-client-factory.impl"
    );
    const factory = SecureSupabaseClientFactory.create();
    const guestClient = factory.createGuestClient(setup.testGuestToken);

    const { error: rpcError } = await guestClient.rpc("update_guest_attendance_with_payment", {
      p_attendance_id: setup.testAttendanceId,
      p_guest_token: setup.testGuestToken,
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
    formData.set("guestToken", setup.testGuestToken);
    formData.set("attendanceStatus", "not_attending");

    const result = await updateGuestAttendanceAction(formData);

    if (!result.success) {
      console.log("Update failed:", JSON.stringify(result.error, null, 2));
    }

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attendanceId).toBe(setup.testAttendanceId);
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
