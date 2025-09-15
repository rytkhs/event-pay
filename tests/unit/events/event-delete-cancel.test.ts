import { SecureSupabaseClientFactory } from "../../../core/security/secure-client-factory.impl";
import { AdminReason } from "../../../core/security/secure-client-factory.types";
import { createTestUser } from "../../helpers/test-user";

describe("イベントの削除/中止ロジック", () => {
  const email = `unit-user-${Date.now()}@example.com`;
  const password = "Password123!";

  it("参加者0・決済0のイベントは削除可能", async () => {
    const user = await createTestUser(email, password, { skipProfileCreation: true });

    const factory = SecureSupabaseClientFactory.getInstance();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "unit-delete-cancel:create"
    );

    // イベント作成（無料・招待トークン付き）
    const { data: created } = await admin
      .from("events")
      .insert({
        title: "削除テスト用イベント",
        date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        fee: 0,
        payment_methods: [],
        status: "upcoming",
        created_by: user.id,
        invite_token: "inv_unit_test_token_aaaaaaaaaaaaaaaaaaaaaa",
      })
      .select("id, created_by")
      .single();

    expect(created).toBeTruthy();

    // 参加者0・決済0 → FKエラーなく削除できる
    const { error: delErr } = await admin.from("events").delete().eq("id", created!.id);
    expect(delErr).toBeNull();
  });

  it("参加者1以上 or 決済1以上のイベントは中止にすべき", async () => {
    const user = await createTestUser(`unit-user2-${Date.now()}@example.com`, password, {
      skipProfileCreation: true,
    });

    const factory = SecureSupabaseClientFactory.getInstance();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "unit-delete-cancel:create2"
    );

    // 有料イベント作成
    const { data: ev } = await admin
      .from("events")
      .insert({
        title: "中止テスト用イベント",
        date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        fee: 1000,
        payment_methods: ["stripe"],
        status: "upcoming",
        created_by: user.id,
        invite_token: "inv_unit_test_token_bbbbbbbbbbbbbbbbbbbbbbbb",
      })
      .select("id, created_by")
      .single();

    expect(ev).toBeTruthy();

    // 参加者1名作成
    const { data: att } = await admin
      .from("attendances")
      .insert({
        event_id: ev!.id,
        nickname: "参加者1",
        email: `p-${Date.now()}@example.com`,
        status: "attending",
        guest_token: `gst_${Math.random().toString(36).slice(2, 10).padEnd(32, "a")}`,
      })
      .select("id")
      .single();

    expect(att?.id).toBeTruthy();

    // 決済レコード1件
    const { data: pay } = await admin
      .from("payments")
      .insert({
        attendance_id: att!.id,
        method: "stripe",
        amount: 1000,
        status: "pending",
      })
      .select("id")
      .single();
    expect(pay?.id).toBeTruthy();

    // 中止へ更新
    const { error: updErr } = await admin
      .from("events")
      .update({ status: "canceled", invite_token: null })
      .eq("id", ev!.id);
    expect(updErr).toBeNull();

    // 招待検証: canceled は canRegister=false
    const { data: canceledEvent } = await admin
      .from("events")
      .select("status, invite_token")
      .eq("id", ev!.id)
      .single();
    expect(canceledEvent?.status).toBe("canceled");
    expect(canceledEvent?.invite_token).toBeNull();
  });
});
