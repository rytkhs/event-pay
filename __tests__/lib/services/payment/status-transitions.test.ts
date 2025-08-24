import { PaymentValidator } from "@/lib/services/payment/validation";
import { PaymentError, PaymentErrorType, PaymentStatus } from "@/lib/services/payment/types";

// Supabaseクライアントのモック（maybeSingle/single両方を用意）
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        maybeSingle: jest.fn(),
      })),
    })),
  })),
} as any;

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe("Payment status transitions", () => {
  let validator: PaymentValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new PaymentValidator(mockSupabase as any);
  });

  const all: PaymentStatus[] = [
    "pending",
    "paid",
    "received",
    "failed",
    "completed",
    "refunded",
    "waived",
  ];

  const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
    pending: ["paid", "received", "failed", "completed", "refunded", "waived"],
    paid: ["completed", "refunded"],
    received: ["completed"],
    failed: ["pending"],
    completed: ["refunded"],
    refunded: [],
    waived: ["completed"],
  };

  function mockExistsAndCurrent(status: PaymentStatus, method: "cash" | "stripe") {
    // 1回目: 存在チェック → maybeSingle
    const firstMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: "123e4567-e89b-12d3-a456-426614174000" },
      error: null,
    });
    // 2回目: 現在の status/method 取得 → single
    const secondSingle = jest.fn().mockResolvedValue({ data: { status, method }, error: null });
    (mockSupabase.from as jest.Mock).mockReturnValueOnce({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: firstMaybeSingle })) })),
    });
    (mockSupabase.from as jest.Mock).mockReturnValueOnce({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single: secondSingle })) })),
    });
  }

  it("全ステータス遷移の許可/不許可を網羅的に検証する", async () => {
    for (const from of all) {
      for (const to of all) {
        if (from === to) continue;
        mockExistsAndCurrent(from, "cash");
        const params = { paymentId: "123e4567-e89b-12d3-a456-426614174000", status: to } as const;

        const shouldAllow = validTransitions[from].includes(to) && !(to === "paid");

        if (shouldAllow) {
          await expect(validator.validateUpdatePaymentStatusParams(params)).resolves.not.toThrow();
        } else {
          await expect(validator.validateUpdatePaymentStatusParams(params)).rejects.toBeInstanceOf(
            PaymentError
          );
          await validator.validateUpdatePaymentStatusParams(params).catch((e) => {
            expect((e as PaymentError).type).toBe(PaymentErrorType.INVALID_STATUS_TRANSITION);
          });
        }
      }
    }
  });

  it("Stripeでは received への遷移は不許可", async () => {
    mockExistsAndCurrent("pending", "stripe");
    const params = { paymentId: "123e4567-e89b-12d3-a456-426614174000", status: "received" as const };
    await expect(validator.validateUpdatePaymentStatusParams(params)).rejects.toBeInstanceOf(
      PaymentError
    );
  });
});
