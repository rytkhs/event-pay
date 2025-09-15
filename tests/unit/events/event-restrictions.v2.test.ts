import {
  checkEditRestrictionsV2,
  type EventWithAttendances,
} from "../../../core/utils/event-restrictions";
import type { Database } from "../../../types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type AttendanceRow = Database["public"]["Tables"]["attendances"]["Row"];

function createEvent(
  overrides: Partial<EventRow> = {},
  attendances: AttendanceRow[] = []
): EventWithAttendances {
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
    status: "upcoming" as Database["public"]["Enums"]["event_status_enum"],
    invite_token: "tok",
    created_by: "user_1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as EventRow;

  return { ...(base as any), ...overrides, attendances } as EventWithAttendances;
}

describe("checkEditRestrictionsV2", () => {
  test("参加者がいても基本項目（title/location/description/date/registration/payment）は編集可", () => {
    const event = createEvent({}, [{ id: "a1" } as any]);
    const violations = checkEditRestrictionsV2(
      event,
      {
        title: "新タイトル",
        location: "新会場",
        description: "新説明",
        date: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        registration_deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        payment_deadline: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
      },
      { attendeeCount: 5, hasActivePayments: false }
    );
    expect(violations).toHaveLength(0);
  });

  test("hasActivePayments=true で fee がロックされる", () => {
    const event = createEvent({ fee: 1000 }, [{ id: "a1" } as any]);
    const violations = checkEditRestrictionsV2(
      event,
      { fee: 2000 },
      { attendeeCount: 1, hasActivePayments: true }
    );
    expect(violations.find((v) => v.field === "fee")).toBeTruthy();
  });

  test("hasActivePayments=true で payment_methods がロックされる", () => {
    const event = createEvent({ payment_methods: ["stripe"] as any }, [{ id: "a1" } as any]);
    const violations = checkEditRestrictionsV2(
      event,
      { payment_methods: ["cash"] as any },
      { attendeeCount: 1, hasActivePayments: true }
    );
    expect(violations.find((v) => v.field === "payment_methods")).toBeTruthy();
  });

  test("capacity は参加者数未満にできない（null は許可）", () => {
    const event = createEvent(
      { capacity: 20 },
      Array.from({ length: 10 }).map((_, i) => ({ id: `a${i}` }) as any)
    );

    // 参加者数10 未満はNG
    const bad = checkEditRestrictionsV2(
      event,
      { capacity: 9 },
      { attendeeCount: 10, hasActivePayments: false }
    );
    expect(bad.find((v) => v.field === "capacity")).toBeTruthy();

    // 参加者数ちょうどはOK
    const ok = checkEditRestrictionsV2(
      event,
      { capacity: 10 },
      { attendeeCount: 10, hasActivePayments: false }
    );
    expect(ok).toHaveLength(0);

    // null は常にOK
    const okNull = checkEditRestrictionsV2(
      event,
      { capacity: null },
      { attendeeCount: 10, hasActivePayments: false }
    );
    expect(okNull).toHaveLength(0);
  });
});
