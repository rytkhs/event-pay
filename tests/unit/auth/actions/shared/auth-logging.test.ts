import { jest } from "@jest/globals";

import { logAuthError, maskEmailForLog } from "@features/auth/services/shared/auth-logging";

const mockHandleServerError = jest.fn();

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: (...args: unknown[]) => mockHandleServerError(...args),
}));

describe("auth-logging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("maskEmailForLog はローカル部をマスクする", () => {
    expect(maskEmailForLog("taro@example.com")).toBe("t***@example.com");
  });

  test("logAuthError は category=authentication と sanitized_email を付与する", () => {
    const error = new Error("boom");

    logAuthError(error, {
      action: "loginFailed",
      email: "taro@example.com",
      additionalData: {
        foo: "bar",
      },
    });

    expect(mockHandleServerError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        category: "authentication",
        action: "loginFailed",
        additionalData: expect.objectContaining({
          foo: "bar",
          sanitized_email: "t***@example.com",
        }),
      })
    );
  });
});
