import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";

import { createOwnedCommunityFixture } from "@tests/helpers/community-owner-fixtures";

import { createCommonTestSetup, type CommonTestSetup } from "../../setup/common-test-setup";

describe("イベントの削除/中止ロジック", () => {
  let setup: CommonTestSetup;
  const createdCommunityIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdAttendanceIds: string[] = [];
  const createdPaymentIds: string[] = [];

  beforeAll(async () => {
    setup = await createCommonTestSetup({
      testName: `event-delete-cancel-test-${Date.now()}`,
      withConnect: false,
      accessedTables: ["public.events", "public.attendances", "public.payments"],
    });
  });

  afterAll(async () => {
    try {
      const admin = setup.adminClient;

      if (createdPaymentIds.length > 0) {
        await admin.from("payments").delete().in("id", createdPaymentIds);
      }

      if (createdAttendanceIds.length > 0) {
        await admin.from("attendances").delete().in("id", createdAttendanceIds);
      }

      if (createdEventIds.length > 0) {
        await admin.from("events").delete().in("id", createdEventIds);
      }

      if (createdCommunityIds.length > 0) {
        await admin.from("communities").delete().in("id", createdCommunityIds);
      }
    } finally {
      await setup.cleanup();
    }
  });

  it("参加者0・決済0のイベントは削除可能", async () => {
    const admin = setup.adminClient;
    const { community } = await createOwnedCommunityFixture(setup.testUser.id, {
      withPayoutProfile: false,
    });
    createdCommunityIds.push(community.id);

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
        community_id: community.id,
        invite_token: "inv_unit_test_token_aaaaaaaaaaaaaaaaaaaaaa",
      })
      .select("id, created_by")
      .single();

    if (insertError) {
      throw new Error(`Failed to create event: ${insertError.message}`);
    }

    expect(created).toBeTruthy();
    createdEventIds.push(created!.id);

    // 参加者0・決済0 → FKエラーなく削除できる
    const { error: delErr } = await admin.from("events").delete().eq("id", created!.id);
    expect(delErr).toBeNull();
    createdEventIds.pop();
  });

  it("参加者1以上 or 決済1以上のイベントは中止にすべき", async () => {
    const admin = setup.adminClient;
    const { community, payoutProfileId } = await createOwnedCommunityFixture(setup.testUser.id, {
      withPayoutProfile: true,
    });
    createdCommunityIds.push(community.id);

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
        community_id: community.id,
        payout_profile_id: payoutProfileId,
        invite_token: "inv_unit_test_token_bbbbbbbbbbbbbbbbbbbbbbbb",
      })
      .select("id, created_by")
      .single();

    if (insertError) {
      throw new Error(`Failed to create event: ${insertError.message}`);
    }

    expect(ev).toBeTruthy();
    createdEventIds.push(ev!.id);

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
    createdAttendanceIds.push(att!.id);

    // 決済レコード1件
    const { data: pay, error: paymentInsertError } = await admin
      .from("payments")
      .insert({
        attendance_id: att!.id,
        method: "stripe",
        payout_profile_id: payoutProfileId,
        amount: 1000,
        status: "pending",
        stripe_payment_intent_id: `pi_test_${Date.now()}`,
      })
      .select("id")
      .single();
    if (paymentInsertError) {
      throw new Error(`Failed to create payment: ${paymentInsertError.message}`);
    }
    expect(pay).toBeTruthy();
    expect(pay?.id).toBeTruthy();
    createdPaymentIds.push(pay!.id);

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
