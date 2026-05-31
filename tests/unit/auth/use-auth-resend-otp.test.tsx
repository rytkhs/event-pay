/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";

import { useAuthResendOtp } from "@features/auth";

describe("useAuthResendOtp", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts cooldown after a successful resend", async () => {
    jest.useFakeTimers();
    const action = jest.fn(async () => ({
      success: true as const,
      data: undefined,
      message: "sent",
    }));

    const { result } = renderHook(() =>
      useAuthResendOtp({
        email: "user@example.com",
        type: "signup",
        action,
      })
    );

    await act(async () => {
      await result.current.resend();
    });

    expect(action).toHaveBeenCalledTimes(1);
    const formData = action.mock.calls[0][0] as FormData;
    expect(formData.get("email")).toBe("user@example.com");
    expect(formData.get("type")).toBe("signup");
    expect(result.current.isDisabled).toBe(true);
    expect(result.current.countdown).toBe(60);
    expect(result.current.message).toBe("確認メールを再送信しました");

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.countdown).toBe(59);
  });

  it("sets an error when resend fails", async () => {
    const action = jest.fn(async () => ({
      success: false as const,
      error: {
        code: "RESEND_OTP_UNEXPECTED_ERROR" as const,
        userMessage: "再送信できませんでした",
        correlationId: "test-correlation-id",
        retryable: false,
      },
    }));

    const { result } = renderHook(() =>
      useAuthResendOtp({
        email: "user@example.com",
        action,
      })
    );

    await act(async () => {
      await result.current.resend();
    });

    expect(result.current.error).toBe("再送信できませんでした");
    expect(result.current.isDisabled).toBe(false);
  });
});
