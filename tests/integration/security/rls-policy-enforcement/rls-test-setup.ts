/**
 * RLS Policy Enforcement テスト共通セットアップ
 *
 * 共通セットアップ関数を使用してリファクタリング済み
 */

import crypto from "node:crypto";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { createMultiUserTestSetup, type MultiUserTestSetup } from "@tests/setup/common-test-setup";

export interface RLSTestSetup {
  adminClient: any;
  testEventId: string;
  testCommunityId: string;
  testCommunitySlug: string;
  testCommunityLegalSlug: string;
  testPayoutProfileId: string;
  testAttendanceId: string;
  testGuestToken: string;
  testInviteToken: string;
  testUserId: string;
  testUserEmail: string;
  testUserPassword: string;
  anotherEventId: string;
  anotherCommunityId: string;
  anotherCommunitySlug: string;
  anotherCommunityLegalSlug: string;
  anotherGuestToken: string;
  anotherUserEmail: string;
  anotherUserPassword: string;
  cleanup: () => Promise<void>;
}

export async function setupRLSTest(): Promise<RLSTestSetup> {
  // 共通セットアップ関数を使用して2つのユーザーを作成
  const multiUserSetup = await createMultiUserTestSetup({
    testName: `rls-policy-test-${Date.now()}`,
    userCount: 2,
    withConnect: false, // Stripe Connectアカウントは後で手動設定
    accessedTables: [
      "public.users",
      "public.communities",
      "public.payout_profiles",
      "public.events",
      "public.attendances",
      "public.payments",
      "public.payment_disputes",
    ],
  });

  const testOrganizer = multiUserSetup.users[0];
  const anotherOrganizer = multiUserSetup.users[1];
  const setupClient = multiUserSetup.adminClient;

  const testUserId = testOrganizer.id;
  const anotherUserId = anotherOrganizer.id;

  const { data: testCommunity, error: testCommunityError } = await setupClient
    .from("communities")
    .insert({
      created_by: testUserId,
      name: "Test Community",
      slug: `test-community-${Date.now()}`,
      description: "RLS owner test community",
    })
    .select("id, slug, legal_slug")
    .single();

  if (testCommunityError || !testCommunity) {
    console.error("Failed to create test community:", testCommunityError);
    throw new Error("Failed to create test community: " + JSON.stringify(testCommunityError));
  }

  const { data: testPayoutProfile, error: testPayoutProfileError } = await setupClient
    .from("payout_profiles")
    .insert({
      owner_user_id: testUserId,
      stripe_account_id: `acct_test_rls_${crypto.randomBytes(4).toString("hex")}`,
      status: "verified",
      collection_ready: true,
      representative_community_id: testCommunity.id,
    })
    .select("id")
    .single();

  if (testPayoutProfileError || !testPayoutProfile) {
    console.error("Failed to create test payout profile:", testPayoutProfileError);
    throw new Error("Failed to create payout profile: " + JSON.stringify(testPayoutProfileError));
  }

  const { error: testCommunityUpdateError } = await setupClient
    .from("communities")
    .update({
      current_payout_profile_id: testPayoutProfile.id,
    })
    .eq("id", testCommunity.id);

  if (testCommunityUpdateError) {
    console.error("Failed to update test community payout profile:", testCommunityUpdateError);
    throw new Error("Failed to update test community: " + JSON.stringify(testCommunityUpdateError));
  }

  const { data: anotherCommunity, error: anotherCommunityError } = await setupClient
    .from("communities")
    .insert({
      created_by: anotherUserId,
      name: "Another Community",
      slug: `another-community-${Date.now()}`,
      description: "RLS isolation community",
    })
    .select("id, slug, legal_slug")
    .single();

  if (anotherCommunityError || !anotherCommunity) {
    console.error("Failed to create another community:", anotherCommunityError);
    throw new Error("Failed to create another community: " + JSON.stringify(anotherCommunityError));
  }

  // テストイベント1の作成
  const testInviteToken = `inv_${crypto.randomBytes(16).toString("hex")}`;
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
      community_id: testCommunity.id,
      payout_profile_id: testPayoutProfile.id,
      invite_token: testInviteToken,
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
  const testEventId = testEvent.id;

  // テストイベント2（別のイベント）の作成
  const anotherInviteToken = `inv_${crypto.randomBytes(16).toString("hex")}`;
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
      community_id: anotherCommunity.id,
      invite_token: anotherInviteToken,
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
  const anotherEventId = anotherEvent.id;

  // テスト参加者の作成
  const { data: testAttendance } = await setupClient
    .from("attendances")
    .insert({
      event_id: testEventId,
      nickname: "Test Participant",
      email: "test-participant@example.com",
      status: "attending",
      guest_token: `gst_${crypto.randomBytes(16).toString("hex")}`,
    })
    .select("id, guest_token")
    .single();
  if (!testAttendance) {
    throw new Error("Failed to insert test attendance");
  }
  const testAttendanceId = testAttendance.id;
  const testGuestToken = testAttendance.guest_token as string;

  // 別イベントの参加者（アクセス分離テスト用）
  const { data: anotherAttendance } = await setupClient
    .from("attendances")
    .insert({
      event_id: anotherEventId,
      nickname: "Another Participant",
      email: "another-participant@example.com",
      status: "attending",
      guest_token: `gst_${crypto.randomBytes(16).toString("hex")}`,
    })
    .select("guest_token")
    .single();
  if (!anotherAttendance) {
    throw new Error("Failed to insert another attendance");
  }
  const anotherGuestToken = anotherAttendance.guest_token as string;

  // クリーンアップ関数
  // RLSテストでは全データをクリーンアップする必要があるため、
  // adminClientを使って全データを削除してから、共通セットアップのcleanupを実行
  const cleanup = async () => {
    try {
      // 外部キー制約を考慮した削除順序
      await setupClient
        .from("payment_disputes")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await setupClient.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await setupClient
        .from("attendances")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await setupClient.from("events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await setupClient
        .from("payout_profiles")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await setupClient
        .from("communities")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
    } catch (error) {
      console.warn("Failed to cleanup test data:", error);
    }

    // 共通セットアップのcleanupを実行（ユーザーも含めてクリーンアップ）
    await multiUserSetup.cleanup();
  };

  return {
    adminClient: setupClient,
    testEventId,
    testCommunityId: testCommunity.id,
    testCommunitySlug: testCommunity.slug,
    testCommunityLegalSlug: testCommunity.legal_slug,
    testPayoutProfileId: testPayoutProfile.id,
    testAttendanceId,
    testGuestToken,
    testInviteToken,
    testUserId,
    testUserEmail: testOrganizer.email,
    testUserPassword: testOrganizer.password,
    anotherEventId,
    anotherCommunityId: anotherCommunity.id,
    anotherCommunitySlug: anotherCommunity.slug,
    anotherCommunityLegalSlug: anotherCommunity.legal_slug,
    anotherGuestToken,
    anotherUserEmail: anotherOrganizer.email,
    anotherUserPassword: anotherOrganizer.password,
    cleanup,
  };
}
