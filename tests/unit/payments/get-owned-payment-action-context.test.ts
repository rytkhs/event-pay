import { jest } from "@jest/globals";

import { getOwnedBulkPaymentActionContextForServerAction } from "@features/payments/services/get-owned-payment-action-context";

let currentCommunityId = "community-1";

jest.mock("@core/community/current-community", () => ({
  getCurrentCommunityServerActionContext: jest.fn().mockImplementation(async () => ({
    success: true,
    data: {
      user: { id: "user-1" },
      currentCommunity: {
        id: currentCommunityId,
        name: "Community A",
        slug: "community-a",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    },
  })),
}));

function createMockSupabase() {
  const paymentsQuery = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({
      data: [
        {
          id: "pay-1",
          attendance_id: "att-1",
          method: "cash",
          status: "pending",
          version: 1,
        },
        {
          id: "pay-2",
          attendance_id: "att-2",
          method: "cash",
          status: "pending",
          version: 2,
        },
      ],
      error: null,
    }),
  };

  const attendancesQuery = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({
      data: [
        { id: "att-1", event_id: "event-1" },
        { id: "att-2", event_id: "event-2" },
      ],
      error: null,
    }),
  };

  const eventsQuery = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({
      data: [
        { id: "event-1", community_id: "community-1" },
        { id: "event-2", community_id: "community-1" },
      ],
      error: null,
    }),
  };

  return {
    from: jest.fn((table: string) => {
      if (table === "payments") return paymentsQuery;
      if (table === "attendances") return attendancesQuery;
      if (table === "events") return eventsQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("getOwnedBulkPaymentActionContextForServerAction", () => {
  beforeEach(() => {
    currentCommunityId = "community-1";
  });

  it("created_by なしでも community_id だけで bulk context を組み立てられる", async () => {
    const supabase = createMockSupabase() as any;

    const result = await getOwnedBulkPaymentActionContextForServerAction(supabase, [
      "pay-1",
      "pay-2",
    ]);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.currentCommunityId).toBe("community-1");
    expect(result.data.payments).toHaveLength(2);
    expect(result.data.payments[0]).toMatchObject({
      paymentId: "pay-1",
      attendanceId: "att-1",
      eventId: "event-1",
      currentCommunityId: "community-1",
    });
  });

  it("linked event の community が不一致なら EVENT_ACCESS_DENIED を返す", async () => {
    currentCommunityId = "community-2";
    const supabase = createMockSupabase() as any;

    const result = await getOwnedBulkPaymentActionContextForServerAction(supabase, [
      "pay-1",
      "pay-2",
    ]);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe("EVENT_ACCESS_DENIED");
  });
});
