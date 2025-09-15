// import { z } from "zod";

import { createEventSchema, updateEventSchema } from "../../../core/validation/event";

// datetime-local 文字列は JST として convertDatetimeLocalToUtc で扱われる前提
describe("event schema - deadline correlations", () => {
  const base = {
    title: "締切検証イベント",
    date: "2025-01-10T10:00", // JST datetime-local
    fee: "1000",
    payment_methods: ["stripe"],
  };

  test("payment_deadline <= date + 30日 (包括) を満たさないとエラー", () => {
    const bad = {
      ...base,
      registration_deadline: "2025-01-05T10:00",
      // 31日後相当（JST想定）
      payment_deadline: "2025-02-10T10:01",
    };
    const parsed = createEventSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.errors.map((e) => e.path.join("."))).toContain("payment_deadline");
    }
  });

  test("registration_deadline <= payment_deadline を満たさないとエラー", () => {
    const bad = {
      ...base,
      registration_deadline: "2025-01-08T10:00",
      payment_deadline: "2025-01-07T10:00",
    };
    const parsed = createEventSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.errors.map((e) => e.path.join("."))).toContain("payment_deadline");
    }
  });

  test("猶予ON時: final_payment_limit <= date + 30日 を超えるgraceはエラー", () => {
    const bad = {
      ...base,
      payment_deadline: "2025-01-10T10:00",
      allow_payment_after_deadline: true,
      grace_period_days: 999, // 上限超
    } as any;
    const parsed = createEventSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      // grace_period_days にエラーが紐付く
      expect(parsed.error.errors.map((e) => e.path.join("."))).toContain("grace_period_days");
    }
  });

  test("updateEventSchemaでも同様の相関が働く", () => {
    const badUpdate = {
      date: "2025-01-10T10:00",
      payment_deadline: "2025-02-15T10:00", // 30日超
    } as any;
    const parsed = updateEventSchema.safeParse(badUpdate);
    expect(parsed.success).toBe(false);
  });
});
