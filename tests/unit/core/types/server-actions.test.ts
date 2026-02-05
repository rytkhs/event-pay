import { z } from "zod";

import { fail, ok, zodFail } from "@core/errors/adapters/server-actions";

describe("Server Actions Result helpers", () => {
  test("ok returns success true with data", () => {
    const res = ok({ ok: true }, { message: "done" });
    expect(res).toEqual({ success: true, data: { ok: true }, message: "done" });
  });

  test("fail returns unified error shape with correlationId", () => {
    const res = fail("INVALID_REQUEST", { userMessage: "bad", retryable: false });
    expect(res.success).toBe(false);
    expect(res.error.code).toBe("INVALID_REQUEST");
    expect(res.error.userMessage).toBe("bad");
    expect(res.error.retryable).toBe(false);
    expect(typeof res.error.correlationId).toBe("string");
    expect(res.error.correlationId.startsWith("sa_")).toBe(true);
  });

  test("zodFail maps zod error to VALIDATION_ERROR", () => {
    const schema = z.object({ id: z.string().uuid() });
    const result = schema.safeParse({ id: "not-uuid" });
    expect(result.success).toBe(false);
    const converted = zodFail((result as any).error);
    expect(converted.error.code).toBe("VALIDATION_ERROR");
    expect(converted.success).toBe(false);
    expect(converted.error.fieldErrors?.id?.[0]).toBeDefined();
  });
});
