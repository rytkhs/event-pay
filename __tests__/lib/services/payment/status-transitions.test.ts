import { PaymentValidator } from "@/lib/services/payment/validation";
import { PaymentError, PaymentErrorType, PaymentStatus } from "@/lib/services/payment/types";

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
  })),
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe("Payment status transitions", () => {
  let validator: PaymentValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new PaymentValidator("mock-url", "mock-key");
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
    // validateUpdatePaymentStatusParams 内で最初に存在チェック(single) → 次に status/method 取得(single)
    const firstSingle = jest.fn().mockResolvedValue({ data: { id: "pay_1" }, error: null });
    const secondSingle = jest.fn().mockResolvedValue({ data: { status, method }, error: null });
    (mockSupabase.from as jest.Mock).mockReturnValueOnce({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single: firstSingle })) })),
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
        const params = { paymentId: "pay_1", status: to } as const;

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
    const params = { paymentId: "pay_1", status: "received" as const };
    await expect(validator.validateUpdatePaymentStatusParams(params)).rejects.toBeInstanceOf(
      PaymentError
    );
  });
});
