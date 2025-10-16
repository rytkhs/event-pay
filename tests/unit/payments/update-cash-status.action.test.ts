import { jest } from "@jest/globals";

import { updateCashStatusAction } from "@/features/payments/actions/update-cash-status";

// 環境依存のSecureSupabaseClientFactory, レート制限, Validator をモック
jest.mock("@core/security/secure-client-factory.impl", () => {
  const adminClient = {
    rpc: jest.fn().mockResolvedValue({ data: { ok: true }, error: null }),
  };
  const authClient = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
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
    }),
  } as any;

  return {
    SecureSupabaseClientFactory: {
      getInstance: () => ({
        createAuthenticatedClient: jest.fn().mockResolvedValue(authClient),
        createAuditedAdminClient: jest.fn().mockResolvedValue(adminClient),
      }),
    },
  };
});

jest.mock("@core/rate-limit", () => ({
  enforceRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  buildKey: jest.fn().mockReturnValue("key"),
  POLICIES: { "payment.statusUpdate": { limit: 10, window: 60 } },
}));

jest.mock("@/features/payments/validation", () => {
  return {
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
