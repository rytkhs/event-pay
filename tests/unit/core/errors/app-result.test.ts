import { AppError } from "@core/errors/app-error";
import {
  errFrom,
  errResult,
  isErrResult,
  isOkResult,
  mapMeta,
  mapResult,
  okResult,
} from "@core/errors/app-result";

describe("core/errors/app-result", () => {
  it("okResult returns success with data and meta", () => {
    const result = okResult({ value: 1 }, { trace: "t1" });
    expect(result).toEqual({
      success: true,
      data: { value: 1 },
      meta: { trace: "t1" },
    });
    expect(isOkResult(result)).toBe(true);
    expect(isErrResult(result)).toBe(false);
  });

  it("errResult returns failure with AppError", () => {
    const error = new AppError("NOT_FOUND");
    const result = errResult(error, { trace: "t2" });
    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
    expect(result.meta).toEqual({ trace: "t2" });
    expect(isErrResult(result)).toBe(true);
    expect(isOkResult(result)).toBe(false);
  });

  it("errFrom normalizes unknown error", () => {
    const result = errFrom("boom", { defaultCode: "NOT_FOUND" });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("mapResult transforms success data", () => {
    const result = okResult(2, { trace: "t3" });
    const mapped = mapResult(result, (value) => value * 2);
    expect(mapped).toEqual({
      success: true,
      data: 4,
      meta: { trace: "t3" },
    });
  });

  it("mapResult skips mapper when data is undefined", () => {
    const result = okResult<number>(undefined, { trace: "t3b" });
    const mapped = mapResult(result, (value) => value * 2);
    expect(mapped).toEqual({
      success: true,
      data: undefined,
      meta: { trace: "t3b" },
    });
  });

  it("mapMeta transforms meta for both success and failure", () => {
    const ok = okResult("ok", { trace: "t4" });
    const okMapped = mapMeta(ok, (meta) => ({ ...meta, step: 1 }));
    expect(okMapped).toEqual({
      success: true,
      data: "ok",
      meta: { trace: "t4", step: 1 },
    });

    const error = new AppError("INTERNAL_ERROR");
    const err = errResult(error, { trace: "t5" });
    const errMapped = mapMeta(err, (meta) => ({ ...meta, step: 2 }));
    expect(errMapped.success).toBe(false);
    if (!errMapped.success) {
      expect(errMapped.error).toBe(error);
      expect(errMapped.meta).toEqual({ trace: "t5", step: 2 });
    }
  });
});
