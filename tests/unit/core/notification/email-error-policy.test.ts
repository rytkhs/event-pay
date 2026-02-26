import { classifyEmailProviderError } from "@core/notification/email-error-policy";

describe("core/notification/email-error-policy", () => {
  it("statusCode 503 は transient になる", () => {
    const result = classifyEmailProviderError({
      statusCode: 503,
      name: "application_error",
      message: "server error",
    });

    expect(result).toEqual({
      type: "transient",
      name: "application_error",
      message: "server error",
      statusCode: 503,
    });
  });

  it("statusCode 403 は permanent になる", () => {
    const result = classifyEmailProviderError({
      statusCode: 403,
      name: "validation_error",
      message: "forbidden",
    });

    expect(result.type).toBe("permanent");
    expect(result.statusCode).toBe(403);
  });

  it("name が rate_limit_exceeded の場合は transient になる", () => {
    const result = classifyEmailProviderError({
      name: "rate_limit_exceeded",
      message: "too many requests",
    });

    expect(result.type).toBe("transient");
  });

  it("statusCode 409 でも concurrent_idempotent_requests は transient になる", () => {
    const result = classifyEmailProviderError({
      statusCode: 409,
      name: "concurrent_idempotent_requests",
      message: "Same idempotency key used while request is in progress",
    });

    expect(result.type).toBe("transient");
    expect(result.statusCode).toBe(409);
  });

  it("name が monthly_quota_exceeded の場合は permanent になる", () => {
    const result = classifyEmailProviderError({
      name: "monthly_quota_exceeded",
      message: "quota exceeded",
    });

    expect(result.type).toBe("permanent");
  });

  it("ネイティブ timeout エラーはネットワークエラーとして分類される", () => {
    const result = classifyEmailProviderError(new Error("socket timeout"));

    expect(result.type).toBe("transient");
    expect(result.message).toBe("ネットワークエラー");
  });

  it("未知の入力は transient fallback になる", () => {
    const result = classifyEmailProviderError({});

    expect(result.type).toBe("transient");
  });

  it("message のみを持つ plain object の message を保持する", () => {
    const result = classifyEmailProviderError({
      message: "something went wrong",
    });

    expect(result).toEqual({
      type: "transient",
      message: "something went wrong",
      name: undefined,
      statusCode: undefined,
    });
  });
});
