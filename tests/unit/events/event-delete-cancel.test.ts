import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";

import { createCommonTestSetup, type CommonTestSetup } from "../../setup/common-test-setup";

describe("イベントの削除/中止ロジック", () => {
  let setup: CommonTestSetup;

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `event-delete-cancel-test-${Date.now()}`,
      withConnect: false,
      accessedTables: ["public.events", "public.attendances", "public.payments"],
    });
  });

  afterAll(async () => {
    try {
      // テスト実行（必要に応じて）
    } finally {
      // 必ずクリーンアップを実行
      await setup.cleanup();
    }
  });

  it("参加者0・決済0のイベントは削除可能", async () => {
    const admin = setup.adminClient;

    // イベント作成（無料・招待トークン付き）
    const eventDate = new Date(Date.now() + 60 * 60 * 1000);
    const registrationDeadline = new Date(eventDate.getTime() - 30 * 60 * 1000); // イベント開始30分前

    const { data: created, error: insertError } = await admin
      .from("events")
      .insert({
        title: "削除テスト用イベント",
        date: eventDate.toISOString(),
        fee: 0,
        payment_methods: ["cash"], // 空配列は不可（制約違反）
        registration_deadline: registrationDeadline.toISOString(),
        location: "テスト会場",
        description: "削除テスト用",
        created_by: setup.testUser.id,
        invite_token: "inv_unit_test_token_aaaaaaaaaaaaaaaaaaaaaa",
      })
      .select("id, created_by")
      .single();

    if (insertError) {
      throw new Error(`Failed to create event: ${insertError.message}`);
    }

    expect(created).toBeTruthy();

    // 参加者0・決済0 → FKエラーなく削除できる
    const { error: delErr } = await admin.from("events").delete().eq("id", created!.id);
    expect(delErr).toBeNull();
  });

  it("参加者1以上 or 決済1以上のイベントは中止にすべき", async () => {
    const admin = setup.adminClient;

    // 有料イベント作成
    const eventDate = new Date(Date.now() + 60 * 60 * 1000);
    const registrationDeadline = new Date(eventDate.getTime() - 30 * 60 * 1000); // イベント開始30分前
    const paymentDeadline = new Date(eventDate.getTime() - 15 * 60 * 1000); // イベント開始15分前（stripe使用時は必須）

    const { data: ev, error: insertError } = await admin
      .from("events")
      .insert({
        title: "中止テスト用イベント",
        date: eventDate.toISOString(),
        fee: 1000,
        payment_methods: ["stripe"],
        registration_deadline: registrationDeadline.toISOString(),
        payment_deadline: paymentDeadline.toISOString(), // stripe使用時は必須
        location: "テスト会場",
        description: "中止テスト用",
        created_by: setup.testUser.id,
        invite_token: "inv_unit_test_token_bbbbbbbbbbbbbbbbbbbbbbbb",
      })
      .select("id, created_by")
      .single();

    if (insertError) {
      throw new Error(`Failed to create event: ${insertError.message}`);
    }

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
      .update({ canceled_at: new Date().toISOString(), invite_token: null })
      .eq("id", ev!.id);
    expect(updErr).toBeNull();

    // 招待検証: canceled は canRegister=false
    const { data: canceledEvent } = await admin
      .from("events")
      .select("canceled_at, invite_token")
      .eq("id", ev!.id)
      .single();
    expect(canceledEvent?.canceled_at).toBeTruthy();
    expect(canceledEvent?.invite_token).toBeNull();
  });
});
