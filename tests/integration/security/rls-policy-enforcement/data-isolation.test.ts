/**
 * RLS Policy Enforcement: Data Isolation Verification Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import {
  getSecureClientFactory,
  createGuestClient,
} from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("Data Isolation Verification", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("ゲストトークンによるデータアクセスが正しく分離されている", async () => {
    const factory = getSecureClientFactory();

    // 正しいゲストトークンを使用したクライアント
    const guestClient = factory.createGuestClient(setup.testGuestToken);

    // 公開RPC経由で参加データを取得
    const { data: rpcRow, error } = await (guestClient as any)
      .rpc("rpc_guest_get_attendance", { p_guest_token: setup.testGuestToken })
      .single();

    expect(error).toBeNull();
    expect(rpcRow).toBeDefined();

    // 自分の参加データのみ取得できることを確認
    expect((rpcRow as any).attendance_id).toBe(setup.testAttendanceId);
    expect((rpcRow as any).event_id).toBe(setup.testEventId);
    expect((rpcRow as any).community_slug).toBe(setup.testCommunitySlug);
    expect((rpcRow as any).community_show_community_link).toBe(false);
  });

  test("無効なゲストトークンでは何のデータも取得できない", async () => {
    const factory = getSecureClientFactory();

    // 無効なゲストトークンを使用したクライアント（存在しないが形式は正しい）
    const invalidGuestClient = factory.createGuestClient("gst_nonexistent_token_12345678901234");

    const { data: rpcRow } = await (invalidGuestClient as any)
      .rpc("rpc_guest_get_attendance", { p_guest_token: "gst_nonexistent_token_12345678901234" })
      .single();

    // RLSにより、データが取得できないことを確認
    expect(rpcRow).toBeNull();
  });

  test("招待トークンによるイベントアクセスが正しく分離されている", async () => {
    const factory = getSecureClientFactory();
    // 招待トークンヘッダーを設定した公開RPC向け匿名クライアント
    const anonClient = factory.createPublicClient({
      headers: {
        "x-invite-token": setup.testInviteToken,
      },
    });

    // 公開RPCで招待トークンに紐づくイベントをテスト
    const { data: events, error } = await (anonClient as any).rpc("rpc_public_get_event", {
      p_invite_token: setup.testInviteToken,
    });

    expect(error).toBeNull();
    expect(events).toBeDefined();

    // 該当する招待トークンのイベントのみ取得できることを確認
    // RPCはTABLE型を返すので、配列になる
    const row = Array.isArray(events) ? events[0] : events;
    expect(row).toBeDefined();
    if (row) {
      expect(row.id).toBe(setup.testEventId);
      expect(row.title).toBe("Test Event for RLS");
      expect(row.community_slug).toBe(setup.testCommunitySlug);
      expect(row.community_show_community_link).toBe(false);
    }
  });

  test("削除済み community に属する guest attendance は public RPC から取得できない", async () => {
    const factory = getSecureClientFactory();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "soft delete community for guest attendance rpc test"
    );
    const guestClient = createGuestClient(setup.testGuestToken);

    const { error: updateError } = await admin
      .from("communities")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", setup.testCommunityId);

    expect(updateError).toBeNull();

    const { data: rpcRow } = await (guestClient as any)
      .rpc("rpc_guest_get_attendance", { p_guest_token: setup.testGuestToken })
      .single();

    expect(rpcRow).toBeNull();
  });
});
