import crypto from "crypto";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { cleanupTestData } from "../../../setup/common-cleanup";
import {
  createMultiUserTestSetup,
  type MultiUserTestSetup,
} from "../../../setup/common-test-setup";

import { generateGuestToken } from "@core/utils/guest-token";
import type { TestUser } from "@tests/helpers/test-user";

import type { Database } from "@/types/database";

/**
 * RLS 認可 準統合テスト
 * - 主催者のみが自イベントの attendances/payments を取得可能
 * - 他ユーザーは空（または権限エラー）
 * - 未認証は権限エラー
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

describe("RLS Authorization for attendances/payments", () => {
  let setup: MultiUserTestSetup;
  let owner: TestUser;
  let other: TestUser;
  let ownerCommunityId: string;
  let ownerPayoutProfileId: string;

  const eventId = crypto.randomUUID();
  const attendanceId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();

  beforeAll(async () => {
    // ユーザー作成（createMultiUserTestSetupを使用）
    setup = await createMultiUserTestSetup({
      testName: `rls-auth-test-${Date.now()}`,
      userCount: 2,
      withConnect: [true, false], // 最初のユーザーはConnect設定済み、2番目は未設定
      accessedTables: [
        "public.users",
        "public.communities",
        "public.payout_profiles",
        "public.events",
        "public.attendances",
        "public.payments",
      ],
    });
    owner = setup.users[0];
    other = setup.users[1];

    // 管理クライアントで初期データ投入（RLSバイパス）
    // setup.adminClientを使用
    const adminClient = setup.adminClient;
    const ownerCommunity = await adminClient
      .from("communities")
      .insert({
        created_by: owner.id,
        name: "RLSテストコミュニティ",
        slug: `rls-auth-community-${Date.now()}`,
        description: "RLS認可テスト用",
      })
      .select("id")
      .single();
    if (ownerCommunity.error || !ownerCommunity.data) {
      throw new Error(`Community insert failed: ${ownerCommunity.error?.message}`);
    }
    ownerCommunityId = ownerCommunity.data.id;

    const ownerPayoutProfile = await adminClient
      .from("payout_profiles")
      .insert({
        owner_user_id: owner.id,
        stripe_account_id: `acct_rls_auth_${Date.now()}`,
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        representative_community_id: ownerCommunityId,
      })
      .select("id")
      .single();
    if (ownerPayoutProfile.error || !ownerPayoutProfile.data) {
      throw new Error(`Payout profile insert failed: ${ownerPayoutProfile.error?.message}`);
    }
    ownerPayoutProfileId = ownerPayoutProfile.data.id;

    const { error: communityUpdateError } = await adminClient
      .from("communities")
      .update({ current_payout_profile_id: ownerPayoutProfileId })
      .eq("id", ownerCommunityId);
    if (communityUpdateError) {
      throw new Error(`Community update failed: ${communityUpdateError.message}`);
    }

    const now = new Date().toISOString();
    const registrationDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const paymentDeadline = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
    const eventDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    // イベント作成（owner 主催）
    const { error: evErr } = await adminClient.from("events").insert({
      id: eventId,
      created_by: owner.id,
      community_id: ownerCommunityId,
      payout_profile_id: ownerPayoutProfileId,
      title: "RLSテストイベント",
      description: "RLS検証用",
      location: "オンライン",
      fee: 1000,
      date: eventDate,
      registration_deadline: registrationDeadline,
      payment_deadline: paymentDeadline,
      payment_methods: ["stripe"],
      canceled_at: null,
      created_at: now,
      updated_at: now,
    });
    if (evErr) throw new Error(`Event insert failed: ${evErr.message}`);

    // 参加者作成
    const { error: atErr } = await adminClient.from("attendances").insert({
      id: attendanceId,
      event_id: eventId,
      nickname: "参加者A",
      email: "participant@example.com",
      status: "attending",
      guest_token: generateGuestToken(),
      created_at: now,
      updated_at: now,
    });
    if (atErr) throw new Error(`Attendance insert failed: ${atErr.message}`);

    // 決済作成
    const { error: payErr } = await adminClient.from("payments").insert({
      id: paymentId,
      attendance_id: attendanceId,
      method: "stripe",
      payout_profile_id: ownerPayoutProfileId,
      amount: 1000,
      status: "pending",
      created_at: now,
      updated_at: now,
    });
    if (payErr) throw new Error(`Payment insert failed: ${payErr.message}`);
  });

  afterAll(async () => {
    // Cleanup using common cleanup function
    await cleanupTestData({
      paymentIds: [paymentId],
      attendanceIds: [attendanceId],
      eventIds: [eventId],
      userEmails: [owner.email, other.email],
    });
    // セットアップのクリーンアップ
    await setup.cleanup();
  });

  test("主催者は自イベントのattendancesを取得できる", async () => {
    const supabase = createSupabaseUserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: owner.email,
      password: owner.password,
    });
    expect(signInError).toBeNull();

    const { data, error } = await supabase.from("attendances").select("id").eq("event_id", eventId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data?.some((r) => r.id === attendanceId)).toBe(true);
  });

  test("他ユーザーは他人のイベントattendancesを取得できない（空 or 権限エラー）", async () => {
    const supabase = createSupabaseUserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: other.email,
      password: other.password,
    });
    expect(signInError).toBeNull();

    const { data, error } = await supabase.from("attendances").select("id").eq("event_id", eventId);

    // RLSによりゼロ件が理想。環境により権限エラーの場合も想定
    if (error) {
      expect(error.message).toMatch(/permission|rls|policy|not allowed/i);
    } else {
      expect(Array.isArray(data)).toBe(true);
      expect(data?.length ?? 0).toBe(0);
    }
  });

  test("未認証はattendancesを取得できない", async () => {
    const supabase = createSupabaseUserClient();
    // サインインしない
    const { data, error } = await supabase.from("attendances").select("id").eq("event_id", eventId);
    // RLSにより未認証は空配列が返る（エラーにならない）
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length ?? 0).toBe(0);
  });

  test("主催者は自イベントのpaymentsを取得できる", async () => {
    const supabase = createSupabaseUserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: owner.email,
      password: owner.password,
    });
    expect(signInError).toBeNull();

    const { data, error } = await supabase
      .from("payments")
      .select("id, attendances!inner(event_id)")
      .eq("attendances.event_id", eventId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data?.some((r: any) => r.id === paymentId)).toBe(true);
  });

  test("他ユーザーは他人のイベントpaymentsを取得できない（空 or 権限エラー）", async () => {
    const supabase = createSupabaseUserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: other.email,
      password: other.password,
    });
    expect(signInError).toBeNull();

    const { data, error } = await supabase
      .from("payments")
      .select("id, attendances!inner(event_id)")
      .eq("attendances.event_id", eventId);

    if (error) {
      expect(error.message).toMatch(/permission|rls|policy|not allowed/i);
    } else {
      expect(Array.isArray(data)).toBe(true);
      expect(data?.length ?? 0).toBe(0);
    }
  });
});

function createSupabaseUserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for tests");
  }
  return createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
