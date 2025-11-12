import { z } from "zod";

import {
  createServerActionError,
  createServerActionSuccess,
  zodErrorToServerActionResponse,
} from "@core/types/server-actions";

describe("Server Actions Result helpers", () => {
  test("createServerActionSuccess returns success true with data", () => {
    const res = createServerActionSuccess({ ok: true }, "done");
    expect(res).toEqual({ success: true, data: { ok: true }, message: "done" });
  });

  test("createServerActionError returns unified error shape with correlationId", () => {
    const res = createServerActionError("INVALID_REQUEST", "bad", { retryable: false });
    expect(res.success).toBe(false);
    expect(res.code).toBe("INVALID_REQUEST");
    expect(res.error).toBe("bad");
    expect(res.retryable).toBe(false);
    expect(typeof res.correlationId).toBe("string");
    expect(res.correlationId?.startsWith("sa_")).toBe(true);
  });

  test("zodErrorToServerActionResponse maps zod error to VALIDATION_ERROR", () => {
    const schema = z.object({ id: z.string().uuid() });
    const result = schema.safeParse({ id: "not-uuid" });
    expect(result.success).toBe(false);
    const converted = zodErrorToServerActionResponse((result as any).error);
    expect(converted.code).toBe("VALIDATION_ERROR");
    expect(converted.success).toBe(false);
    expect(converted.fieldErrors?.[0].field).toBe("id");
  });
});
