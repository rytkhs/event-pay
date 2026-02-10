import { z } from "zod";

import { fail, ok, zodFail } from "@core/errors/adapters/server-actions";

import { expectActionFailure } from "@tests/helpers/assert-result";

describe("Server Actions Result helpers", () => {
  test("ok returns success true with data", () => {
    const res = ok({ ok: true }, { message: "done" });
    expect(res).toEqual({ success: true, data: { ok: true }, message: "done" });
  });

  test("fail returns unified error shape with correlationId", () => {
    const res = fail("INVALID_REQUEST", { userMessage: "bad", retryable: false });
    expect(res.success).toBe(false);
    const error = expectActionFailure(res);
    expect(error.code).toBe("INVALID_REQUEST");
    expect(error.userMessage).toBe("bad");
    expect(error.retryable).toBe(false);
    expect(typeof error.correlationId).toBe("string");
    expect(error.correlationId.startsWith("sa_")).toBe(true);
  });

  test("zodFail maps zod error to VALIDATION_ERROR", () => {
    const schema = z.object({ id: z.string().uuid() });
    const result = schema.safeParse({ id: "not-uuid" });
    expect(result.success).toBe(false);
    const converted = zodFail((result as any).error);
    const error = expectActionFailure(converted);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(converted.success).toBe(false);
    expect(error.fieldErrors?.id?.[0]).toBeDefined();
  });
});
