/**
 * RLS Policy Enforcement テスト共通セットアップ
 *
 * 共通セットアップ関数を使用してリファクタリング済み
 */

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { createMultiUserTestSetup, type MultiUserTestSetup } from "@tests/setup/common-test-setup";

export interface RLSTestSetup {
  testEventId: string;
  testAttendanceId: string;
  testGuestToken: string;
  testInviteToken: string;
  testUserId: string;
  anotherEventId: string;
  anotherGuestToken: string;
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
      "public.events",
      "public.attendances",
      "public.payments",
      "public.stripe_connect_accounts",
    ],
  });

  const testOrganizer = multiUserSetup.users[0];
  const anotherOrganizer = multiUserSetup.users[1];
  const setupClient = multiUserSetup.adminClient;

  const testUserId = testOrganizer.id;
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
  const testEventId = testEvent.id;
  const testInviteToken = "inv_test_rls_token_12345678901234567";

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
  const anotherEventId = anotherEvent.id;

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
      guest_token: "gst_another_guest_token_123456789012",
    })
    .select("guest_token")
    .single();
  if (!anotherAttendance) {
    throw new Error("Failed to insert another attendance");
  }
  const anotherGuestToken = anotherAttendance.guest_token as string;

  // Stripe Connectアカウントの設定
  await setupClient.from("stripe_connect_accounts").insert({
    user_id: testUserId,
    stripe_account_id: "acct_test_123",
    payouts_enabled: true,
  });

  // クリーンアップ関数
  // RLSテストでは全データをクリーンアップする必要があるため、
  // adminClientを使って全データを削除してから、共通セットアップのcleanupを実行
  const cleanup = async () => {
    try {
      // 外部キー制約を考慮した削除順序: payments → attendances → events → stripe_connect_accounts
      await setupClient.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await setupClient
        .from("attendances")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await setupClient.from("events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await setupClient
        .from("stripe_connect_accounts")
        .delete()
        .neq("user_id", "00000000-0000-0000-0000-000000000000");
    } catch (error) {
      console.warn("Failed to cleanup test data:", error);
    }

    // 共通セットアップのcleanupを実行（ユーザーも含めてクリーンアップ）
    await multiUserSetup.cleanup();
  };

  return {
    testEventId,
    testAttendanceId,
    testGuestToken,
    testInviteToken,
    testUserId,
    anotherEventId,
    anotherGuestToken,
    cleanup,
  };
}
