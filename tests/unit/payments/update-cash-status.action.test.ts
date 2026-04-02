import { jest } from "@jest/globals";

import { updateCashStatusAction } from "@features/payments/server";

import { setupRateLimitMocks } from "../../setup/common-mocks";

let currentCommunityId = "community-1";

// 環境依存の Supabase factory, レート制限, Validator をモック
jest.mock("@core/supabase/factory", () => {
  const paymentsQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        id: "pay-1",
        version: 1,
        method: "cash",
        status: "pending",
        attendance_id: "att-1",
      },
      error: null,
    }),
  };

  const attendancesQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        id: "att-1",
        event_id: "00000000-0000-0000-0000-000000000010",
      },
      error: null,
    }),
  };

  const eventsQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        id: "00000000-0000-0000-0000-000000000010",
        community_id: "community-1",
      },
      error: null,
    }),
  };

  const authClient = {
    from: jest.fn((table: string) => {
      if (table === "payments") return paymentsQuery;
      if (table === "attendances") return attendancesQuery;
      if (table === "events") return eventsQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: jest.fn<() => Promise<{ data: { ok: boolean }; error: null }>>().mockResolvedValue({
      data: { ok: true },
      error: null,
    }),
  };

  return {
    createServerActionSupabaseClient: jest
      .fn<() => Promise<typeof authClient>>()
      .mockResolvedValue(authClient),
  };
});

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

// レート制限のモック（共通関数を使用するため、モック化のみ宣言）
jest.mock("@core/rate-limit", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const actual = jest.requireActual("@core/rate-limit") as Record<string, unknown>;
  return {
    ...actual,
    __esModule: true,
    enforceRateLimit: jest.fn(),
    withRateLimit: jest.fn(),
    buildKey: jest.fn(),
    POLICIES: {
      ...(actual.POLICIES as Record<string, unknown>),
      "payment.statusUpdate": { limit: 10, window: 60 },
    },
  };
});

jest.mock("@features/payments/validation", () => {
  const actual = jest.requireActual<typeof import("@features/payments/validation")>(
    "@features/payments/validation"
  );
  return {
    ...actual,
    PaymentValidator: class {
      private client: any;
      constructor(client: any) {
        this.client = client;
      }
      async validateAttendanceAccess() {
        return;
      }
      async validateUpdatePaymentStatusParams() {
        return;
      }
    },
  };
});

describe("updateCashStatusAction - 現金受領/免除", () => {
  beforeAll(() => {
    // 共通モックを使用してレート制限を設定
    setupRateLimitMocks(true, "key");
  });

  beforeEach(() => {
    currentCommunityId = "community-1";
  });

  it("受領(received)に更新し成功レスポンスを返す", async () => {
    const result = await updateCashStatusAction({
      paymentId: "00000000-0000-0000-0000-000000000001",
      status: "received",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("received");
      expect(result.data.paymentId).toBe("00000000-0000-0000-0000-000000000001");
    }
  });

  it("免除(waived)に更新し成功レスポンスを返す", async () => {
    const result = await updateCashStatusAction({
      paymentId: "00000000-0000-0000-0000-000000000002",
      status: "waived",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("waived");
      expect(result.data.paymentId).toBe("00000000-0000-0000-0000-000000000002");
    }
  });

  it("current community 不一致なら EVENT_ACCESS_DENIED を返す", async () => {
    currentCommunityId = "community-2";

    const result = await updateCashStatusAction({
      paymentId: "00000000-0000-0000-0000-000000000003",
      status: "received",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("EVENT_ACCESS_DENIED");
  });
});
