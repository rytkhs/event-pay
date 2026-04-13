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

type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];
type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];
type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];

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

describe("adminUpdateAttendanceStatusAction integration", () => {
  let setup: MultiUserTestSetup;
  let cleanupHelper: ReturnType<typeof createTestDataCleanupHelper>;

  beforeAll(async () => {
    setupNextCacheMocks();
    setup = await createMultiUserTestSetup({
      testName: `admin-update-attendance-status-${Date.now()}`,
      userCount: 2,
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

  async function arrangeActionContext(userIndex: number, currentCommunityId: string) {
    const user = setup.users[userIndex];
    const authenticatedClient = await createAuthenticatedClient(user.email, user.password);

    mockCreateServerActionSupabaseClient.mockResolvedValue(authenticatedClient as never);
    mockGetCurrentCommunityServerActionContext.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: currentCommunityId,
          name: "Current Community",
          slug: "current-community",
          createdAt: new Date().toISOString(),
        },
        user: {
          id: user.id,
          email: user.email,
          user_metadata: {},
          app_metadata: {},
        } as never,
      })
    );
  }

  async function createTrackedEvent(
    ownerId: string,
    options: Parameters<typeof createCommunityOwnedEventFixture>[1] = {}
  ) {
    const fixture = await createCommunityOwnedEventFixture(ownerId, options);
    cleanupHelper.trackEvent(fixture.event.id);
    cleanupHelper.trackCommunity(fixture.communityId);
    if (fixture.payoutProfileId) {
      cleanupHelper.trackPayoutProfile(fixture.payoutProfileId);
    }
    return fixture;
  }

  async function createTrackedAttendance(
    eventId: string,
    options: {
      email?: string;
      nickname?: string;
      status?: AttendanceStatus;
    } = {}
  ) {
    const { data, error } = await setup.adminClient
      .from("attendances")
      .insert({
        event_id: eventId,
        email: options.email ?? `participant-${Date.now()}-${Math.random()}@example.com`,
        nickname: options.nickname ?? `参加者-${Math.random().toString(36).slice(2, 8)}`,
        status: options.status ?? "attending",
        guest_token: generateGuestToken(),
      })
      .select("id, status")
      .single();

    expect(error).toBeNull();
    cleanupHelper.trackAttendance(data!.id);
    return data!;
  }

  async function createTrackedPayment(
    attendanceId: string,
    options: {
      amount: number;
      method?: PaymentMethod;
      status?: PaymentStatus;
    }
  ) {
    const { data, error } = await setup.adminClient
      .from("payments")
      .insert({
        attendance_id: attendanceId,
        amount: options.amount,
        method: options.method ?? "cash",
        status: options.status ?? "pending",
        paid_at:
          options.status === "received" || options.status === "paid"
            ? new Date().toISOString()
            : null,
      })
      .select("id, amount, method, status")
      .single();

    expect(error).toBeNull();
    cleanupHelper.trackPayment(data!.id);
    return data!;
  }

  async function getAttendanceStatus(attendanceId: string) {
    const { data, error } = await setup.adminClient
      .from("attendances")
      .select("status")
      .eq("id", attendanceId)
      .single();

    expect(error).toBeNull();
    return data!.status;
  }

  async function getPayments(attendanceId: string) {
    const { data, error } = await setup.adminClient
      .from("payments")
      .select("id, amount, method, status")
      .eq("attendance_id", attendanceId)
      .order("created_at", { ascending: true });

    expect(error).toBeNull();
    return data ?? [];
  }

  test("主催者は無料イベントの出欠を変更でき、主催者以外は変更できない", async () => {
    const owner = setup.users[0];
    const fixture = await createTrackedEvent(owner.id, {
      fee: 0,
      payment_methods: [],
    });
    const ownedAttendance = await createTrackedAttendance(fixture.event.id, {
      status: "maybe",
      nickname: "主催者変更対象",
    });

    await arrangeActionContext(0, fixture.communityId);
    const { adminUpdateAttendanceStatusAction } =
      await import("@/features/events/actions/admin-update-attendance-status");

    const ownerResult = await adminUpdateAttendanceStatusAction({
      eventId: fixture.event.id,
      attendanceId: ownedAttendance.id,
      status: "not_attending",
    });

    expect(ownerResult.success).toBe(true);
    expect(await getAttendanceStatus(ownedAttendance.id)).toBe("not_attending");
    expect(await getPayments(ownedAttendance.id)).toHaveLength(0);

    const unauthorizedAttendance = await createTrackedAttendance(fixture.event.id, {
      status: "maybe",
      nickname: "権限なし変更対象",
    });

    await arrangeActionContext(1, fixture.communityId);
    const unauthorizedResult = await adminUpdateAttendanceStatusAction({
      eventId: fixture.event.id,
      attendanceId: unauthorizedAttendance.id,
      status: "attending",
    });

    expect(unauthorizedResult.success).toBe(false);
    expect(await getAttendanceStatus(unauthorizedAttendance.id)).toBe("maybe");
    expect(await getPayments(unauthorizedAttendance.id)).toHaveLength(0);
  });

  test("有料イベントで非参加系から参加に戻すと支払い待ちになる", async () => {
    const owner = setup.users[0];
    const fixture = await createTrackedEvent(owner.id, {
      fee: 1800,
      payment_methods: ["cash"],
      withPayoutProfile: false,
      attachPayoutProfileToEvent: false,
    });
    const attendance = await createTrackedAttendance(fixture.event.id, {
      status: "not_attending",
    });

    await arrangeActionContext(0, fixture.communityId);
    const { adminUpdateAttendanceStatusAction } =
      await import("@/features/events/actions/admin-update-attendance-status");

    const result = await adminUpdateAttendanceStatusAction({
      eventId: fixture.event.id,
      attendanceId: attendance.id,
      status: "attending",
      paymentMethod: "cash",
    });

    expect(result.success).toBe(true);
    expect(await getAttendanceStatus(attendance.id)).toBe("attending");

    const payments = await getPayments(attendance.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toEqual(
      expect.objectContaining({
        amount: 1800,
        method: "cash",
        status: "pending",
      })
    );
    cleanupHelper.trackPayment(payments[0]!.id);
  });

  test("参加から非参加系に変えると未確定支払いだけキャンセルされる", async () => {
    const owner = setup.users[0];
    const fixture = await createTrackedEvent(owner.id, {
      fee: 1800,
      payment_methods: ["cash"],
      withPayoutProfile: false,
      attachPayoutProfileToEvent: false,
    });
    const attendance = await createTrackedAttendance(fixture.event.id, {
      status: "attending",
    });
    const payment = await createTrackedPayment(attendance.id, {
      amount: 1800,
      method: "cash",
      status: "pending",
    });

    await arrangeActionContext(0, fixture.communityId);
    const { adminUpdateAttendanceStatusAction } =
      await import("@/features/events/actions/admin-update-attendance-status");

    const result = await adminUpdateAttendanceStatusAction({
      eventId: fixture.event.id,
      attendanceId: attendance.id,
      status: "not_attending",
    });

    expect(result.success).toBe(true);
    expect(await getAttendanceStatus(attendance.id)).toBe("not_attending");

    const payments = await getPayments(attendance.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toEqual(
      expect.objectContaining({
        id: payment.id,
        amount: 1800,
        method: "cash",
        status: "canceled",
      })
    );
  });

  test("確定済み支払いがある参加者は出欠だけ変更される", async () => {
    const owner = setup.users[0];
    const fixture = await createTrackedEvent(owner.id, {
      fee: 1800,
      payment_methods: ["cash"],
      withPayoutProfile: false,
      attachPayoutProfileToEvent: false,
    });
    const attendance = await createTrackedAttendance(fixture.event.id, {
      status: "attending",
    });
    const payment = await createTrackedPayment(attendance.id, {
      amount: 1800,
      method: "cash",
      status: "received",
    });

    await arrangeActionContext(0, fixture.communityId);
    const { adminUpdateAttendanceStatusAction } =
      await import("@/features/events/actions/admin-update-attendance-status");

    const result = await adminUpdateAttendanceStatusAction({
      eventId: fixture.event.id,
      attendanceId: attendance.id,
      status: "maybe",
      acknowledgedFinalizedPayment: true,
    });

    expect(result.success).toBe(true);
    expect(await getAttendanceStatus(attendance.id)).toBe("maybe");

    const payments = await getPayments(attendance.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toEqual(payment);
  });

  test("定員超過と中止済みイベントでは出欠も支払いも変更されない", async () => {
    const owner = setup.users[0];
    const fullFixture = await createTrackedEvent(owner.id, {
      fee: 1800,
      capacity: 1,
      payment_methods: ["cash"],
      withPayoutProfile: false,
      attachPayoutProfileToEvent: false,
    });
    await createTrackedAttendance(fullFixture.event.id, {
      status: "attending",
      nickname: "既存参加者",
    });
    const overCapacityTarget = await createTrackedAttendance(fullFixture.event.id, {
      status: "not_attending",
      nickname: "定員超過対象",
    });

    await arrangeActionContext(0, fullFixture.communityId);
    const { adminUpdateAttendanceStatusAction } =
      await import("@/features/events/actions/admin-update-attendance-status");

    const capacityResult = await adminUpdateAttendanceStatusAction({
      eventId: fullFixture.event.id,
      attendanceId: overCapacityTarget.id,
      status: "attending",
      paymentMethod: "cash",
    });

    expect(capacityResult.success).toBe(false);
    if (!capacityResult.success) {
      expect(capacityResult.error.code).toBe("RESOURCE_CONFLICT");
      expect(capacityResult.error.userMessage).toContain("先にイベントの定員を変更");
    }
    expect(await getAttendanceStatus(overCapacityTarget.id)).toBe("not_attending");
    expect(await getPayments(overCapacityTarget.id)).toHaveLength(0);

    const canceledFixture = await createTrackedEvent(owner.id, {
      fee: 0,
      payment_methods: [],
      canceled_at: new Date().toISOString(),
    });
    const canceledAttendance = await createTrackedAttendance(canceledFixture.event.id, {
      status: "maybe",
    });

    await arrangeActionContext(0, canceledFixture.communityId);
    const canceledResult = await adminUpdateAttendanceStatusAction({
      eventId: canceledFixture.event.id,
      attendanceId: canceledAttendance.id,
      status: "attending",
    });

    expect(canceledResult.success).toBe(false);
    if (!canceledResult.success) {
      expect(canceledResult.error.code).toBe("EVENT_CANCELED");
    }
    expect(await getAttendanceStatus(canceledAttendance.id)).toBe("maybe");
    expect(await getPayments(canceledAttendance.id)).toHaveLength(0);
  });
});
