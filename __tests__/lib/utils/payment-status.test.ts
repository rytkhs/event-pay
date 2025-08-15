import { getComputedPaymentStatus, calcNetPaidAmount, PaymentRow } from "@/lib/utils/payment-status";

describe("getComputedPaymentStatus", () => {
  const basePayment: Partial<PaymentRow> = {
    id: "test",
    attendance_id: "att",
    method: "stripe",
    amount: 1000,
    status: "paid",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any;

  it("returns partial_refund when refunded_amount < amount", () => {
    const payment = { ...basePayment, refunded_amount: 200 } as PaymentRow;
    expect(getComputedPaymentStatus(payment)).toBe("partial_refund");
  });

  it("returns refunded when refunded_amount >= amount", () => {
    const payment = { ...basePayment, refunded_amount: 1000 } as PaymentRow;
    expect(getComputedPaymentStatus(payment)).toBe("refunded");
  });

  it("returns DB status when no refund", () => {
    const payment = { ...basePayment, refunded_amount: 0 } as PaymentRow;
    expect(getComputedPaymentStatus(payment)).toBe("paid");
  });
});

describe("calcNetPaidAmount", () => {
  it("calculates amount minus refunded_amount", () => {
    const payment = {
      id: "test",
      attendance_id: "att",
      method: "stripe",
      amount: 1000,
      status: "paid",
      refunded_amount: 200,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as PaymentRow;
    expect(calcNetPaidAmount(payment)).toBe(800);
  });
});
