import { beforeAll, beforeEach, afterAll, describe, expect, test } from "@jest/globals";

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { createCommunityOwnedEventFixture } from "@tests/helpers/community-owner-fixtures";
import {
  createPendingTestPayment,
  createTestAttendance,
  createTestUserWithConnect,
  type TestAttendanceData,
} from "@tests/helpers/test-payment-data";
import { deleteTestUser } from "@tests/helpers/test-user";
import {
  createTestDataCleanupHelper,
  type TestDataCleanupHelper,
} from "@tests/setup/common-test-setup";

describe("参加系 RPC の payout snapshot 保存", () => {
  let adminClient: any;
  let cleanupHelper: TestDataCleanupHelper;
  let testUser: Awaited<ReturnType<typeof createTestUserWithConnect>>;
  let testEvent: {
    id: string;
    payout_profile_id: string | null;
    fee: number;
  };

  beforeAll(async () => {
    const testName = `participation-payout-snapshot-${Date.now()}`;
    testUser = await createTestUserWithConnect(`${testName}@example.com`, "TestPassword123!");
    adminClient = await createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      `${testName} payment payout snapshot setup`,
      {
        accessedTables: [
          "public.communities",
          "public.payout_profiles",
          "public.events",
          "public.attendances",
          "public.payments",
        ],
      }
    );
    cleanupHelper = createTestDataCleanupHelper(adminClient);

    const fixture = await createCommunityOwnedEventFixture(testUser.id, {
      fee: 1200,
      payment_methods: ["stripe", "cash"],
      payment_deadline: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      withPayoutProfile: true,
      attachPayoutProfileToEvent: true,
    });

    cleanupHelper.trackCommunity(fixture.communityId);
    cleanupHelper.trackEvent(fixture.event.id);
    if (fixture.payoutProfileId) {
      cleanupHelper.trackPayoutProfile(fixture.payoutProfileId);
    }

    testEvent = fixture.event;
  });

  beforeEach(async () => {
    const { data: attendances } = await adminClient
      .from("attendances")
      .select("id")
      .eq("event_id", testEvent.id);

    const attendanceIds = (attendances ?? []).map((attendance: { id: string }) => attendance.id);
    if (attendanceIds.length > 0) {
      await adminClient.from("payments").delete().in("attendance_id", attendanceIds);
    }

    await adminClient.from("attendances").delete().eq("event_id", testEvent.id);
  });

  afterAll(async () => {
    if (cleanupHelper) {
      await cleanupHelper.cleanup();
    }
    if (testUser) {
      await deleteTestUser(testUser.email);
    }
  });

  async function fetchLatestPayment(attendanceId: string) {
    const { data, error } = await adminClient
      .from("payments")
      .select(
        "id, method, status, payout_profile_id, stripe_account_id, destination_account_id, checkout_idempotency_key, stripe_checkout_session_id, stripe_payment_intent_id"
      )
      .eq("attendance_id", attendanceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(error).toBeNull();
    return data;
  }

  test("register_attendance_with_payment: Stripe は payout_profile_id と account snapshot を保存する", async () => {
    const guestToken = `gst_${Math.random().toString(36).slice(2, 34).padEnd(32, "a").slice(0, 32)}`;

    const { data: attendanceId, error } = await adminClient.rpc(
      "register_attendance_with_payment",
      {
        p_event_id: testEvent.id,
        p_nickname: "Stripe Register Guest",
        p_email: `register-${Date.now()}@example.com`,
        p_status: "attending",
        p_guest_token: guestToken,
        p_payment_method: "stripe",
        p_event_fee: testEvent.fee,
      }
    );

    expect(error).toBeNull();
    expect(attendanceId).toEqual(expect.any(String));

    const payment = await fetchLatestPayment(attendanceId as string);
    expect(payment?.method).toBe("stripe");
    expect(payment?.status).toBe("pending");
    expect(payment?.payout_profile_id).toBe(testEvent.payout_profile_id);
    expect(payment?.stripe_account_id).toBe(testUser.stripeConnectAccountId);
    expect(payment?.destination_account_id).toBe(testUser.stripeConnectAccountId);
  });

  test("update_guest_attendance_with_payment: cash -> stripe 切替で snapshot を保存し、stripe -> cash で null に戻す", async () => {
    const attendance = (await createTestAttendance(testEvent.id, {
      email: `switch-${Date.now()}@example.com`,
      nickname: "Switch Guest",
      status: "attending",
    })) as TestAttendanceData;

    const cashPayment = await createPendingTestPayment(attendance.id, {
      amount: testEvent.fee,
      method: "cash",
    });

    const switchToStripe = await adminClient.rpc("update_guest_attendance_with_payment", {
      p_attendance_id: attendance.id,
      p_guest_token: attendance.guest_token,
      p_status: "attending",
      p_payment_method: "stripe",
      p_event_fee: testEvent.fee,
    });

    expect(switchToStripe.error).toBeNull();

    const stripePayment = await fetchLatestPayment(attendance.id);
    expect(stripePayment?.id).toBe(cashPayment.id);
    expect(stripePayment?.method).toBe("stripe");
    expect(stripePayment?.payout_profile_id).toBe(testEvent.payout_profile_id);
    expect(stripePayment?.stripe_account_id).toBe(testUser.stripeConnectAccountId);
    expect(stripePayment?.destination_account_id).toBe(testUser.stripeConnectAccountId);
    expect(stripePayment?.checkout_idempotency_key).toBeNull();
    expect(stripePayment?.stripe_checkout_session_id).toBeNull();
    expect(stripePayment?.stripe_payment_intent_id).toBeNull();

    const switchToCash = await adminClient.rpc("update_guest_attendance_with_payment", {
      p_attendance_id: attendance.id,
      p_guest_token: attendance.guest_token,
      p_status: "attending",
      p_payment_method: "cash",
      p_event_fee: testEvent.fee,
    });

    expect(switchToCash.error).toBeNull();

    const cashAgainPayment = await fetchLatestPayment(attendance.id);
    expect(cashAgainPayment?.id).toBe(cashPayment.id);
    expect(cashAgainPayment?.method).toBe("cash");
    expect(cashAgainPayment?.payout_profile_id).toBeNull();
    expect(cashAgainPayment?.stripe_account_id).toBeNull();
    expect(cashAgainPayment?.destination_account_id).toBeNull();
  });
});
