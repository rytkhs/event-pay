import { AppError } from "@core/errors/app-error";
import { errResult, okResult } from "@core/errors/app-result";
import {
  fail,
  ok,
  toActionResultFromAppResult,
  toAppResultFromActionResult,
} from "@core/errors/adapters/server-actions";

describe("core/errors/adapters/server-actions AppResult conversions", () => {
  it("toActionResultFromAppResult maps success", () => {
    const result = okResult({ id: "1" });
    const action = toActionResultFromAppResult(result, {
      message: "done",
      redirectUrl: "/next",
      needsVerification: true,
    });
    expect(action).toEqual({
      success: true,
      data: { id: "1" },
      message: "done",
      redirectUrl: "/next",
      needsVerification: true,
    });
  });

  it("toActionResultFromAppResult maps error and generates correlationId", () => {
    const error = new AppError("INVALID_REQUEST", { userMessage: "bad" });
    const result = errResult(error);
    const action = toActionResultFromAppResult(result, { retryable: false });
    expect(action.success).toBe(false);
    if (!action.success) {
      expect(action.error.code).toBe("INVALID_REQUEST");
      expect(action.error.userMessage).toBe("bad");
      expect(action.error.retryable).toBe(false);
      expect(action.error.correlationId.startsWith("sa_")).toBe(true);
    }
  });

  it("toAppResultFromActionResult maps success and preserves meta", () => {
    const action = ok({ id: "2" }, { message: "ok", redirectUrl: "/r" });
    const result = toAppResultFromActionResult(action);
    expect(result).toEqual({
      success: true,
      data: { id: "2" },
      meta: { message: "ok", redirectUrl: "/r", needsVerification: undefined },
    });
  });

  it("toAppResultFromActionResult maps error and preserves details", () => {
    const action = fail("FORBIDDEN", {
      userMessage: "no",
      retryable: false,
      redirectUrl: "/login",
      details: { scope: "admin" },
      fieldErrors: { name: ["required"] },
    });
    const result = toAppResultFromActionResult(action);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.userMessage).toBe("no");
      expect(result.error.retryable).toBe(false);
      expect(result.error.correlationId).toBeDefined();
      expect(result.error.details).toEqual({
        scope: "admin",
        name: ["required"],
      });
      expect(result.meta).toEqual({
        redirectUrl: "/login",
        needsVerification: undefined,
      });
    }
  });
});
