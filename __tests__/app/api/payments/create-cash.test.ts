/**
 * @jest-environment node
 */

import { createCashAction } from "@/app/payments/actions/create-cash";

// fetch のみ最低限モック（NextResponse.json は実装に依存するため Response はモックしない）
global.fetch = jest.fn() as unknown as typeof fetch;

// Supabase server client のモック
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      insert: jest.fn(),
    })),
  })),
}));

// レートリミットのモック
jest.mock("@/lib/rate-limit-middleware", () => ({
  handleRateLimit: jest.fn().mockResolvedValue(null),
}));

// PaymentService/Validatorの挙動はルート内で呼ばれる箇所を最小限に
jest.mock("@/lib/services/payment", () => {
  const actual = jest.requireActual("@/lib/services/payment");
  return {
    ...actual,
    PaymentService: jest.fn(() => ({
      createCashPayment: jest.fn(async () => ({ paymentId: "pay_123" })),
    })),
    PaymentValidator: jest.fn(() => ({
      validateCreateCashPaymentParams: jest.fn(async () => { }),
    })),
  };
});

import { createClient } from "@/lib/supabase/server";

describe("createCashAction (Server Action)", () => {

  let mockSupabase: { auth: { getUser: jest.Mock }; from: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = {
      auth: { getUser: jest.fn() },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(),
          })),
        })),
        insert: jest.fn(),
      })),
    };
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  it("0円イベントでは success:true かつ data.noPaymentRequired=true を返す", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user_1" } }, error: null });
    // attendances -> events(fee=0)
    const single = jest.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        events: { id: "ev_1", fee: 0, created_by: "user_1" },
      },
      error: null,
    });
    (mockSupabase.from as jest.Mock).mockReturnValueOnce({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single })) })),
    });
    const result = await createCashAction({ attendanceId: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("noPaymentRequired" in result.data && result.data.noPaymentRequired).toBe(true);
      expect(result.data.paymentId).toBeNull();
    }
  });

  it("有料イベントでは paymentId を返す", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user_1" } }, error: null });
    // attendances -> events(fee>0)
    const single = jest.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440001",
        events: { id: "ev_1", fee: 1000, created_by: "user_1" },
      },
      error: null,
    });
    (mockSupabase.from as jest.Mock).mockReturnValueOnce({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single })) })),
    });
    const result = await createCashAction({ attendanceId: "550e8400-e29b-41d4-a716-446655440001" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paymentId).toBe("pay_123");
    }
  });
});
