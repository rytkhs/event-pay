import { afterAll, afterEach, beforeAll, describe, expect, test, jest } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { okResult } from "@core/errors/app-result";
import { getCurrentCommunityServerActionContext } from "@core/community/current-community";
import { getPaymentPort } from "@core/ports/payments";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import { createCommunityOwnedEventFixture } from "@tests/helpers/community-owner-fixtures";
import {
  createMultiUserTestSetup,
  createTestDataCleanupHelper,
  type MultiUserTestSetup,
} from "@tests/setup/common-test-setup";

import type { Database } from "@/types/database";

jest.mock("@core/community/current-community", () => ({
  getCurrentCommunityServerActionContext: jest.fn(),
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: jest.fn(),
}));

jest.mock("@core/ports/payments", () => ({
  getPaymentPort: jest.fn(),
}));

const mockGetCurrentCommunityServerActionContext =
  getCurrentCommunityServerActionContext as jest.MockedFunction<
    typeof getCurrentCommunityServerActionContext
  >;
const mockCreateServerActionSupabaseClient =
  createServerActionSupabaseClient as jest.MockedFunction<typeof createServerActionSupabaseClient>;
const mockGetPaymentPort = getPaymentPort as jest.MockedFunction<typeof getPaymentPort>;

type AuthenticatedClient = {
  client: SupabaseClient<Database>;
};

async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<AuthenticatedClient> {
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

  return { client };
}

describe("adminAddAttendanceAction integration", () => {
  let setup: MultiUserTestSetup;
  let cleanupHelper: ReturnType<typeof createTestDataCleanupHelper>;

  beforeAll(async () => {
    setup = await createMultiUserTestSetup({
      testName: `admin-add-attendance-${Date.now()}`,
      userCount: 2,
      withConnect: false,
      accessedTables: [
        "public.users",
        "public.communities",
        "public.events",
        "public.attendances",
        "public.payments",
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

  test("cash payment failure rolls back the created attendance with the owner-scoped client", async () => {
    const owner = setup.users[0];
    const authenticated = await createAuthenticatedClient(owner.email, owner.password);
    const fixture = await createCommunityOwnedEventFixture(owner.id, {
      fee: 1800,
      payment_methods: ["cash"],
      withPayoutProfile: false,
      attachPayoutProfileToEvent: false,
    });

    cleanupHelper.trackEvent(fixture.event.id);
    cleanupHelper.trackCommunity(fixture.communityId);
    if (fixture.payoutProfileId) {
      cleanupHelper.trackPayoutProfile(fixture.payoutProfileId);
    }

    mockCreateServerActionSupabaseClient.mockResolvedValue(authenticated.client as never);
    mockGetCurrentCommunityServerActionContext.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: fixture.communityId,
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

    const createCashPayment = jest
      .fn()
      .mockRejectedValue(
        new PaymentError(PaymentErrorType.DATABASE_ERROR, "cash payment failed for rollback test")
      );
    mockGetPaymentPort.mockReturnValue({
      createCashPayment,
    } as never);

    const { adminAddAttendanceAction } =
      await import("@/features/events/actions/admin-add-attendance");
    const result = await adminAddAttendanceAction({
      eventId: fixture.event.id,
      nickname: "Rollback Participant",
      status: "attending",
      paymentMethod: "cash",
    });

    expect(createCashPayment).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
    }

    const attendanceCount = await setup.adminClient
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", fixture.event.id);

    expect(attendanceCount.error).toBeNull();
    expect(attendanceCount.count ?? 0).toBe(0);
  });

  test("capacity reached rejects manual add without creating attendance or payment", async () => {
    const owner = setup.users[0];
    const authenticated = await createAuthenticatedClient(owner.email, owner.password);
    const fixture = await createCommunityOwnedEventFixture(owner.id, {
      fee: 1200,
      capacity: 1,
      payment_methods: ["cash"],
      withPayoutProfile: false,
      attachPayoutProfileToEvent: false,
    });

    cleanupHelper.trackEvent(fixture.event.id);
    cleanupHelper.trackCommunity(fixture.communityId);
    if (fixture.payoutProfileId) {
      cleanupHelper.trackPayoutProfile(fixture.payoutProfileId);
    }

    const { data: existingAttendance, error: existingAttendanceError } = await setup.adminClient
      .from("attendances")
      .insert({
        event_id: fixture.event.id,
        email: "existing-capacity@example.com",
        nickname: "Existing Participant",
        status: "attending",
        guest_token: `gst_${`${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(32, "a").slice(0, 32)}`,
      })
      .select("id")
      .single();

    expect(existingAttendanceError).toBeNull();
    cleanupHelper.trackAttendance(existingAttendance!.id);

    mockCreateServerActionSupabaseClient.mockResolvedValue(authenticated.client as never);
    mockGetCurrentCommunityServerActionContext.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: fixture.communityId,
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

    const createCashPayment = jest.fn();
    mockGetPaymentPort.mockReturnValue({
      createCashPayment,
    } as never);

    const { adminAddAttendanceAction } =
      await import("@/features/events/actions/admin-add-attendance");
    const result = await adminAddAttendanceAction({
      eventId: fixture.event.id,
      nickname: "Over Capacity Participant",
      status: "attending",
      paymentMethod: "cash",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("RESOURCE_CONFLICT");
      expect(result.error.userMessage).toContain("先にイベントの定員を変更");
    }
    expect(createCashPayment).not.toHaveBeenCalled();

    const attendanceCount = await setup.adminClient
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", fixture.event.id);

    expect(attendanceCount.error).toBeNull();
    expect(attendanceCount.count ?? 0).toBe(1);
  });
});
