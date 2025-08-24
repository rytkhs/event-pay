import { retryWithIdempotency } from "@/lib/stripe/idempotency-retry";

describe("retryWithIdempotency", () => {
  it("resolves immediately when no error", async () => {
    const mock = jest.fn().mockResolvedValue("ok");
    const result = await retryWithIdempotency(mock, { maxRetries: 3, initialDelayMs: 1 });
    expect(result).toBe("ok");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries on idempotency_key_in_use and eventually succeeds", async () => {
    const errors = Array(2).fill({ code: "idempotency_key_in_use" });
    const mock = jest
      .fn()
      .mockImplementationOnce(() => Promise.reject(errors[0]))
      .mockImplementationOnce(() => Promise.reject(errors[1]))
      .mockResolvedValue("success");

    const result = await retryWithIdempotency(mock, { maxRetries: 5, initialDelayMs: 1 });
    expect(result).toBe("success");
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("throws after max retries are exceeded", async () => {
    const errorObj = { code: "idempotency_key_in_use" };
    const mock = jest.fn().mockRejectedValue(errorObj);
    await expect(
      retryWithIdempotency(mock, { maxRetries: 2, initialDelayMs: 1 })
    ).rejects.toBe(errorObj);
    expect(mock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
