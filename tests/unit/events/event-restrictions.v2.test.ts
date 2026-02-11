import {
  buildRestrictionContext,
  createFormDataSnapshot,
  evaluateEventEditViolations,
} from "@core/domain/event-edit-restrictions";
import type { FieldViolation } from "@core/domain/event-edit-restrictions";
import type { EventRow } from "@core/types/event";

import type { Database } from "@/types/database";

type AttendanceRow = Database["public"]["Tables"]["attendances"]["Row"];

function createEvent(
  overrides: Partial<EventRow> = {},
  attendances: AttendanceRow[] = []
): EventRow & { attendances: AttendanceRow[] } {
  const base: EventRow = {
    id: "evt_test",
    title: "テストイベント",
    description: null,
    location: null,
    date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    fee: 0,
    capacity: null,
    payment_methods: [],
    registration_deadline: null,
    payment_deadline: null,
    canceled_at: null,
    invite_token: "tok",
    created_by: "user_1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as EventRow;

  return { ...(base as any), ...overrides, attendances } as EventRow & {
    attendances: AttendanceRow[];
  };
}

describe("event edit restrictions v2 (domain)", () => {
  test("参加者がいても基本項目（title/location/description/date/registration/payment）は編集可", async () => {
    const event = createEvent({}, [{ id: "a1" } as any]);
    const context = buildRestrictionContext(
      {
        fee: event.fee,
        capacity: event.capacity,
        payment_methods: event.payment_methods ?? [],
        title: event.title,
        description: event.description ?? undefined,
        location: event.location ?? undefined,
        date: event.date,
        registration_deadline: event.registration_deadline ?? undefined,
        payment_deadline: event.payment_deadline ?? undefined,
      },
      { hasAttendees: true, attendeeCount: 5, hasStripePaid: false },
      "upcoming"
    );

    const formData = createFormDataSnapshot({
      ...event,
      title: "新タイトル",
      location: "新会場",
      description: "新説明",
      date: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      registration_deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      payment_deadline: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
    } as any);

    const violations = await evaluateEventEditViolations({
      context,
      formData,
      patch: {
        title: "新タイトル",
        location: "新会場",
        description: "新説明",
        date: (formData as any).date,
        registration_deadline: (formData as any).registration_deadline,
        payment_deadline: (formData as any).payment_deadline,
      },
    });

    expect(violations).toHaveLength(0);
  });

  test("hasStripePaid=true で fee がロックされる", async () => {
    const event = createEvent({ fee: 1000 }, [{ id: "a1" } as any]);
    const context = buildRestrictionContext(
      {
        fee: event.fee,
        capacity: event.capacity,
        payment_methods: event.payment_methods ?? [],
        title: event.title,
      },
      { hasAttendees: true, attendeeCount: 1, hasStripePaid: true },
      "upcoming"
    );

    const formData = createFormDataSnapshot({ ...event, fee: 2000 } as any);
    const violations = await evaluateEventEditViolations({
      context,
      formData,
      patch: { fee: 2000 },
    });

    expect(violations.find((v: FieldViolation) => v.field === "fee")).toBeTruthy();
  });

  test("hasAttendees=true で payment_methods の解除がブロックされる（追加は許可）", async () => {
    const event = createEvent({ payment_methods: ["stripe"] as any }, [{ id: "a1" } as any]);
    const context = buildRestrictionContext(
      {
        fee: event.fee,
        capacity: event.capacity,
        payment_methods: event.payment_methods ?? [],
        title: event.title,
      },
      { hasAttendees: true, attendeeCount: 1, hasStripePaid: false },
      "upcoming"
    );

    const removalFormData = createFormDataSnapshot({ ...event, payment_methods: ["cash"] } as any);
    const removalViolations = await evaluateEventEditViolations({
      context,
      formData: removalFormData,
      patch: { payment_methods: ["cash"] },
    });
    expect(
      removalViolations.find((v: FieldViolation) => v.field === "payment_methods")
    ).toBeTruthy();

    const addFormData = createFormDataSnapshot({
      ...event,
      payment_methods: ["stripe", "cash"],
    } as any);
    const addViolations = await evaluateEventEditViolations({
      context,
      formData: addFormData,
      patch: { payment_methods: ["stripe", "cash"] },
    });
    expect(addViolations).toHaveLength(0);
  });

  test("capacity は参加者数未満にできない（null は許可）", async () => {
    const event = createEvent(
      { capacity: 20 },
      Array.from({ length: 10 }).map((_, i) => ({ id: `a${i}` }) as any)
    );

    const context = buildRestrictionContext(
      {
        fee: event.fee,
        capacity: event.capacity,
        payment_methods: event.payment_methods ?? [],
        title: event.title,
      },
      { hasAttendees: true, attendeeCount: 10, hasStripePaid: false },
      "upcoming"
    );

    const badFormData = createFormDataSnapshot({ ...event, capacity: 9 } as any);
    const bad = await evaluateEventEditViolations({
      context,
      formData: badFormData,
      patch: { capacity: 9 },
    });
    expect(bad.find((v: FieldViolation) => v.field === "capacity")).toBeTruthy();

    const okFormData = createFormDataSnapshot({ ...event, capacity: 10 } as any);
    const ok = await evaluateEventEditViolations({
      context,
      formData: okFormData,
      patch: { capacity: 10 },
    });
    expect(ok).toHaveLength(0);

    const okNullFormData = createFormDataSnapshot({ ...event, capacity: null } as any);
    const okNull = await evaluateEventEditViolations({
      context,
      formData: okNullFormData,
      patch: { capacity: null },
    });
    expect(okNull).toHaveLength(0);
  });
});
