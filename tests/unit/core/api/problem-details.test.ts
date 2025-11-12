import { createProblemResponse, type ProblemDetails } from "@core/api/problem-details";

describe("Problem Details", () => {
  test("createProblemResponse returns RFC7807 response with correlation id header", async () => {
    const res = createProblemResponse("VALIDATION_ERROR", {
      instance: "/api/test",
      detail: "入力値の検証に失敗しました",
    });

    expect(res.headers.get("Content-Type")).toBe("application/problem+json");
    const cid = res.headers.get("X-Correlation-ID");
    expect(cid).toBeTruthy();

    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.instance).toBe("/api/test");
    expect(body.correlation_id).toBe(cid);
    expect(body.retryable).toBe(false);
  });

  test("rate limited adds Retry-After header by default", async () => {
    const res = createProblemResponse("RATE_LIMITED", { instance: "/api/test" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});
