import { jest } from "@jest/globals";

import { updateCashStatusAction } from "@features/payments/server";

import { setupRateLimitMocks } from "../../setup/common-mocks";

// 環境依存のSecureSupabaseClientFactory, レート制限, Validator をモック
jest.mock("@core/security/secure-client-factory.impl", () => {
  const adminClient = {
    rpc: jest.fn<() => Promise<{ data: { ok: boolean }; error: null }>>().mockResolvedValue({
      data: { ok: true },
      error: null,
    }),
  };
  const authClient = {
    auth: {
      getUser: jest
        .fn<() => Promise<{ data: { user: { id: string } } | null; error: null }>>()
        .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest
        .fn<
          () => Promise<{
            data: {
              id: string;
              version: number;
              method: string;
              status: string;
              attendance_id: string;
              attendances: Array<{
                id: string;
                events: Array<{ id: string; created_by: string }>;
              }>;
            };
            error: null;
          }>
        >()
        .mockResolvedValue({
          data: {
            id: "pay-1",
            version: 1,
            method: "cash",
            status: "pending",
            attendance_id: "att-1",
            attendances: [{ id: "att-1", events: [{ id: "evt-1", created_by: "user-1" }] }],
          },
          error: null,
        }),
      update: jest.fn().mockReturnThis(),
    }),
    rpc: jest.fn<() => Promise<{ data: { ok: boolean }; error: null }>>().mockResolvedValue({
      data: { ok: true },
      error: null,
    }),
  };
  const factory = {
    createAuthenticatedClient: jest
      .fn<() => Promise<typeof authClient>>()
      .mockResolvedValue(authClient),
    createAuditedAdminClient: jest
      .fn<() => Promise<typeof adminClient>>()
      .mockResolvedValue(adminClient),
  };

  return {
    getSecureClientFactory: () => factory,
    SecureSupabaseClientFactory: {
      create: () => factory,
    },
  };
});

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
});
