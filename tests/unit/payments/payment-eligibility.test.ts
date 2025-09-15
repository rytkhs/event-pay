import {
  checkBasicPaymentEligibility,
  canCreateStripeSession,
  canGuestRepay,
} from "../../../core/validation/payment-eligibility";

describe("payment eligibility", () => {
  const baseEvent = {
    id: "e1",
    status: "upcoming" as const,
    fee: 1000,
    date: "2025-01-01T10:00:00.000Z",
    payment_deadline: "2025-01-01T08:00:00.000Z",
    allow_payment_after_deadline: false,
    grace_period_days: 0,
  };
  const attendee = { id: "a1", status: "attending" as const };

  test("締切前は許可、締切後は不許可（猶予OFF）", () => {
    const before = checkBasicPaymentEligibility(
      attendee,
      baseEvent,
      new Date("2025-01-01T07:00:00.000Z")
    );
    expect(before.isEligible).toBe(true);

    const after = checkBasicPaymentEligibility(
      attendee,
      baseEvent,
      new Date("2025-01-01T09:00:00.000Z")
    );
    expect(after.isEligible).toBe(false);
    expect(after.reason).toContain("決済期限");
  });

  test("猶予ON: 締切超過でもfinal内は許可、final超過は不許可", () => {
    const event = { ...baseEvent, allow_payment_after_deadline: true, grace_period_days: 2 };
    // base payment_deadline 08:00, grace 2d => final = min(08:00+2d, date+30d) = 2d延長
    const within = checkBasicPaymentEligibility(
      attendee,
      event,
      new Date("2025-01-02T09:00:00.000Z")
    );
    expect(within.isEligible).toBe(true);

    const over = checkBasicPaymentEligibility(
      attendee,
      event,
      new Date("2025-01-05T00:00:00.000Z")
    );
    expect(over.isEligible).toBe(false);
  });

  test("キャンセルイベントは常に不許可", () => {
    const event = { ...baseEvent, status: "canceled" as const, allow_payment_after_deadline: true };
    const res = checkBasicPaymentEligibility(attendee, event, new Date("2025-01-01T07:00:00.000Z"));
    expect(res.isEligible).toBe(false);
    expect(res.reason).toContain("キャンセル");
  });

  test("canCreateStripeSession excludes finalized statuses", () => {
    const event = { ...baseEvent, allow_payment_after_deadline: true, grace_period_days: 30 };
    const paidAttendee = {
      id: "a1",
      status: "attending" as const,
      payment: { method: "stripe", status: "paid" as const },
    };
    const res = canCreateStripeSession(paidAttendee, event, new Date("2025-01-01T07:00:00.000Z"));
    expect(res.isEligible).toBe(false);
  });

  test("canGuestRepay requires stripe method and allowed statuses", () => {
    const event = { ...baseEvent, allow_payment_after_deadline: true, grace_period_days: 30 };
    const failedStripe = {
      id: "a1",
      status: "attending" as const,
      payment: { method: "stripe", status: "failed" as const },
    };
    const ok = canGuestRepay(failedStripe, event, new Date("2025-01-01T07:00:00.000Z"));
    expect(ok.isEligible).toBe(true);

    const receivedCash = {
      id: "a1",
      status: "attending" as const,
      payment: { method: "cash", status: "failed" as const },
    };
    const ng = canGuestRepay(receivedCash, event, new Date("2025-01-01T07:00:00.000Z"));
    expect(ng.isEligible).toBe(false);
  });
});
