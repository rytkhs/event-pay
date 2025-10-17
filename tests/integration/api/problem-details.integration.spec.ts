import { createProblemResponse } from "@core/api/problem-details";

describe("Problem Details integration - retryable and correlation id", () => {
  test("INTERNAL_ERROR is retryable and sets correlation header", async () => {
    const res = createProblemResponse("INTERNAL_ERROR", { instance: "/api/x" });
    expect(res.status).toBe(500);
    const cid = res.headers.get("X-Correlation-ID");
    expect(cid).toBeTruthy();
    const body = (await res.json()) as { retryable: boolean; correlation_id: string };
    expect(body.retryable).toBe(true);
    expect(body.correlation_id).toBe(cid);
  });

  test("VALIDATION_ERROR is not retryable", async () => {
    const res = createProblemResponse("VALIDATION_ERROR", { instance: "/api/x" });
    const body = (await res.json()) as { retryable: boolean };
    expect(body.retryable).toBe(false);
    expect(res.status).toBe(422);
  });
});
