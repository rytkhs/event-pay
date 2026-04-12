import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { okResult } from "@core/errors/app-result";
import { getCurrentCommunityServerActionContext } from "@core/community/current-community";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { createCommunityOwnedEventFixture } from "@tests/helpers/community-owner-fixtures";
import { setupNextCacheMocks } from "@tests/setup/common-mocks";
import {
  createMultiUserTestSetup,
  createTestDataCleanupHelper,
  type MultiUserTestSetup,
} from "@tests/setup/common-test-setup";

import type { Database } from "@/types/database";

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@core/community/current-community", () => ({
  getCurrentCommunityServerActionContext: jest.fn(),
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: jest.fn(),
}));

const mockGetCurrentCommunityServerActionContext =
  getCurrentCommunityServerActionContext as jest.MockedFunction<
    typeof getCurrentCommunityServerActionContext
  >;
const mockCreateServerActionSupabaseClient =
  createServerActionSupabaseClient as jest.MockedFunction<typeof createServerActionSupabaseClient>;

async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<SupabaseClient<Database>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for tests");
  }

  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Failed to sign in test user: ${error.message}`);
  }

  return client;
}

function generateGuestToken(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "gst_";
  for (let i = 0; i < 32; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

describe("deleteMistakenAttendanceAction integration", () => {
  let setup: MultiUserTestSetup;
  let cleanupHelper: ReturnType<typeof createTestDataCleanupHelper>;

  beforeAll(async () => {
    setupNextCacheMocks();
    setup = await createMultiUserTestSetup({
      testName: `delete-mistaken-attendance-${Date.now()}`,
      userCount: 1,
      withConnect: false,
      accessedTables: [
        "public.users",
        "public.communities",
        "public.events",
        "public.attendances",
        "public.payments",
        "public.system_logs",
      ],
    });
    cleanupHelper = createTestDataCleanupHelper(setup.adminClient);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await cleanupHelper.cleanup();
    cleanupHelper.reset();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  async function arrangeActionContext(eventId: string, communityId: string) {
    const owner = setup.users[0];
    const authenticatedClient = await createAuthenticatedClient(owner.email, owner.password);
    mockCreateServerActionSupabaseClient.mockResolvedValue(authenticatedClient as never);
    mockGetCurrentCommunityServerActionContext.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: communityId,
          name: "Current Community",
          slug: "current-community",
          createdAt: new Date().toISOString(),
        },
        user: {
          id: owner.id,
          email: owner.email,
          user_metadata: {},
          app_metadata: {},
        } as never,
      })
    );

    const { deleteMistakenAttendanceAction } =
      await import("@/features/events/actions/delete-mistaken-attendance");
    return { deleteMistakenAttendanceAction, owner, eventId };
  }

  test("決済痕跡のないpending payment付き参加を削除し、同じメールで再登録できる", async () => {
    const owner = setup.users[0];
    const fixture = await createCommunityOwnedEventFixture(owner.id, {
      fee: 1800,
      payment_methods: ["cash"],
      withPayoutProfile: false,
      attachPayoutProfileToEvent: false,
    });
    cleanupHelper.trackEvent(fixture.event.id);
    cleanupHelper.trackCommunity(fixture.communityId);

    const email = `mistaken-${Date.now()}@example.com`;
    const { data: attendance, error: attendanceError } = await setup.adminClient
      .from("attendances")
      .insert({
        event_id: fixture.event.id,
        email,
        nickname: "誤登録",
        status: "attending",
        guest_token: generateGuestToken(),
      })
      .select("id")
      .single();
    expect(attendanceError).toBeNull();
    cleanupHelper.trackAttendance(attendance!.id);

    const { data: payment, error: paymentError } = await setup.adminClient
      .from("payments")
      .insert({
        attendance_id: attendance!.id,
        amount: fixture.event.fee,
        method: "cash",
        status: "pending",
      })
      .select("id")
      .single();
    expect(paymentError).toBeNull();
    cleanupHelper.trackPayment(payment!.id);

    const { deleteMistakenAttendanceAction } = await arrangeActionContext(
      fixture.event.id,
      fixture.communityId
    );
    const result = await deleteMistakenAttendanceAction({
      eventId: fixture.event.id,
      attendanceId: attendance!.id,
    });

    expect(result.success).toBe(true);

    const deletedAttendance = await setup.adminClient
      .from("attendances")
      .select("id")
      .eq("id", attendance!.id)
      .maybeSingle();
    expect(deletedAttendance.data).toBeNull();

    const deletedPayment = await setup.adminClient
      .from("payments")
      .select("id")
      .eq("id", payment!.id)
      .maybeSingle();
    expect(deletedPayment.data).toBeNull();

    const { data: replacement, error: replacementError } = await setup.adminClient
      .from("attendances")
      .insert({
        event_id: fixture.event.id,
        email,
        nickname: "再登録",
        status: "attending",
        guest_token: generateGuestToken(),
      })
      .select("id")
      .single();
    expect(replacementError).toBeNull();
    cleanupHelper.trackAttendance(replacement!.id);
  });

  test("Stripe Checkout作成済みのpending参加は削除できない", async () => {
    const owner = setup.users[0];
    const fixture = await createCommunityOwnedEventFixture(owner.id, {
      fee: 1800,
      payment_methods: ["stripe"],
      payment_deadline: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      withPayoutProfile: true,
      attachPayoutProfileToEvent: true,
    });
    cleanupHelper.trackEvent(fixture.event.id);
    cleanupHelper.trackCommunity(fixture.communityId);
    if (fixture.payoutProfileId) cleanupHelper.trackPayoutProfile(fixture.payoutProfileId);

    const { data: attendance, error: attendanceError } = await setup.adminClient
      .from("attendances")
      .insert({
        event_id: fixture.event.id,
        email: `stripe-started-${Date.now()}@example.com`,
        nickname: "Stripe開始済み",
        status: "attending",
        guest_token: generateGuestToken(),
      })
      .select("id")
      .single();
    expect(attendanceError).toBeNull();
    cleanupHelper.trackAttendance(attendance!.id);

    const { data: payment, error: paymentError } = await setup.adminClient
      .from("payments")
      .insert({
        attendance_id: attendance!.id,
        amount: fixture.event.fee,
        method: "stripe",
        status: "pending",
        stripe_checkout_session_id: `cs_test_${Date.now()}`,
        payout_profile_id: fixture.payoutProfileId,
      })
      .select("id")
      .single();
    expect(paymentError).toBeNull();
    cleanupHelper.trackPayment(payment!.id);

    const { deleteMistakenAttendanceAction } = await arrangeActionContext(
      fixture.event.id,
      fixture.communityId
    );
    const result = await deleteMistakenAttendanceAction({
      eventId: fixture.event.id,
      attendanceId: attendance!.id,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("RESOURCE_CONFLICT");
    }

    const existingAttendance = await setup.adminClient
      .from("attendances")
      .select("id")
      .eq("id", attendance!.id)
      .maybeSingle();
    expect(existingAttendance.data?.id).toBe(attendance!.id);
  });
});
