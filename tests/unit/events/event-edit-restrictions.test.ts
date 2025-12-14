import {
  evaluateEventEditViolations,
  buildRestrictionContext,
  createFormDataSnapshot,
} from "@core/domain/event-edit-restrictions";

describe("evaluateEventEditViolations", () => {
  const baseEvent = {
    fee: 1000,
    capacity: 20,
    payment_methods: ["stripe"],
    title: "イベント",
    description: "説明",
    location: "会場",
    date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    registration_deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    payment_deadline: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
    allow_payment_after_deadline: false,
    grace_period_days: 0,
  };

  const attendanceInfo = {
    hasAttendees: true,
    attendeeCount: 10,
    hasStripePaid: true,
  };

  const baseContext = buildRestrictionContext(baseEvent, attendanceInfo, "upcoming");

  const baseFormData = createFormDataSnapshot(baseEvent as Record<string, unknown>);

  it("returns empty violations when patch fields are allowed", async () => {
    const violations = await evaluateEventEditViolations({
      context: baseContext,
      formData: baseFormData,
      patch: { title: "New Title" },
    });

    expect(violations).toHaveLength(0);
  });

  it("returns violation only for patched restricted fields", async () => {
    const nextFormData = createFormDataSnapshot({
      ...baseEvent,
      capacity: 5,
    });

    const violations = await evaluateEventEditViolations({
      context: baseContext,
      formData: nextFormData,
      patch: { capacity: 5 },
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ field: "capacity" });
  });

  it("ignores fields not present in patch", async () => {
    const nextFormData = createFormDataSnapshot({
      ...baseEvent,
      payment_methods: ["stripe"],
    });

    const violations = await evaluateEventEditViolations({
      context: baseContext,
      formData: nextFormData,
      patch: {},
    });

    expect(violations).toHaveLength(0);
  });

  it("allows payment method additions but blocks removals", async () => {
    const addFormData = createFormDataSnapshot({
      ...baseEvent,
      payment_methods: ["stripe", "cash"],
    });

    const addViolations = await evaluateEventEditViolations({
      context: baseContext,
      formData: addFormData,
      patch: { payment_methods: ["stripe", "cash"] },
    });

    expect(addViolations).toHaveLength(0);

    const removalFormData = createFormDataSnapshot({
      ...baseEvent,
      payment_methods: ["cash"],
    });

    const removalViolations = await evaluateEventEditViolations({
      context: baseContext,
      formData: removalFormData,
      patch: { payment_methods: ["cash"] },
    });

    expect(removalViolations).toHaveLength(1);
    expect(removalViolations[0]).toMatchObject({ field: "payment_methods" });
  });
});
