import { deriveEventStatus } from "@core/utils/derive-event-status";

describe("deriveEventStatus", () => {
  const base = new Date("2025-01-01T00:00:00.000Z");
  const iso = base.toISOString();

  it("returns canceled when canceled_at is set", () => {
    expect(deriveEventStatus(iso, "2025-01-01T00:00:00.000Z", base)).toBe("canceled");
  });

  it("upcoming before start", () => {
    const now = new Date(base.getTime() - 1);
    expect(deriveEventStatus(iso, null, now)).toBe("upcoming");
  });

  it("ongoing at start instant", () => {
    const now = new Date(base.getTime());
    expect(deriveEventStatus(iso, null, now)).toBe("ongoing");
  });

  it("ongoing just before 24h", () => {
    const now = new Date(base.getTime() + 24 * 60 * 60 * 1000 - 1);
    expect(deriveEventStatus(iso, null, now)).toBe("ongoing");
  });

  it("past at 24h", () => {
    const now = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    expect(deriveEventStatus(iso, null, now)).toBe("past");
  });
});
