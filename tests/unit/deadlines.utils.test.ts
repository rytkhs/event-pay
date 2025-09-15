import { deriveEffectiveDeadlines, deriveFinalPaymentLimit } from "../../core/utils/deadlines";

describe("deadlines utils", () => {
  const date = "2025-01-01T10:00:00.000Z"; // event date (UTC)

  test("effective deadlines fallback to event date when null", () => {
    const { effectiveRegistrationDeadline, effectivePaymentDeadline, eventDate } =
      deriveEffectiveDeadlines({ date, registration_deadline: null, payment_deadline: null });

    expect(effectiveRegistrationDeadline.toISOString()).toBe(eventDate.toISOString());
    expect(effectivePaymentDeadline.toISOString()).toBe(eventDate.toISOString());
  });

  test("final limit without allow == effectivePaymentDeadline", () => {
    const { effectivePaymentDeadline, eventDate } = deriveEffectiveDeadlines({
      date,
      registration_deadline: null,
      payment_deadline: "2025-01-01T05:00:00.000Z",
    });

    const finalLimit = deriveFinalPaymentLimit({
      effectivePaymentDeadline,
      eventDate,
      allow_payment_after_deadline: false,
      grace_period_days: 10,
    });

    expect(finalLimit.toISOString()).toBe(effectivePaymentDeadline.toISOString());
  });

  test("final limit with allow == min(effective + grace, date + 30d)", () => {
    const { effectivePaymentDeadline, eventDate } = deriveEffectiveDeadlines({
      date,
      registration_deadline: null,
      payment_deadline: "2025-01-01T05:00:00.000Z",
    });

    // grace smaller than 30d anchor
    const final1 = deriveFinalPaymentLimit({
      effectivePaymentDeadline,
      eventDate,
      allow_payment_after_deadline: true,
      grace_period_days: 3,
    });
    const expected1 = new Date(effectivePaymentDeadline.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(final1.toISOString()).toBe(expected1.toISOString());

    // grace larger than anchor -> capped at date+30d
    const final2 = deriveFinalPaymentLimit({
      effectivePaymentDeadline,
      eventDate,
      allow_payment_after_deadline: true,
      grace_period_days: 60,
    });
    // grace は 30日にクランプされるため、候補は (deadline + 30d)
    const candidate = new Date(effectivePaymentDeadline.getTime() + 30 * 24 * 60 * 60 * 1000);
    const anchor = new Date(new Date(date).getTime() + 30 * 24 * 60 * 60 * 1000);
    const expected2 = new Date(Math.min(candidate.getTime(), anchor.getTime()));
    expect(final2.toISOString()).toBe(expected2.toISOString());
  });
});
