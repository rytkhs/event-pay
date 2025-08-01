import { renderHook, act } from "@testing-library/react";
import { useErrorHandler, useParticipationErrorHandler } from "@/hooks/use-error-handler";

// Toast hookをモック
jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

describe("useErrorHandler", () => {
  it("should handle errors correctly", () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError("NETWORK_ERROR");
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.code).toBe("NETWORK_ERROR");
    expect(result.current.isRetryable).toBe(true);
  });

  it("should clear errors", () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError("INVALID_TOKEN");
    });

    expect(result.current.isError).toBe(true);

    act(() => {
      result.current.clearError();
    });

    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("should execute async functions with error handling", async () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockAsyncFn = jest.fn().mockResolvedValue("success");

    let returnValue: string | null = null;
    await act(async () => {
      returnValue = await result.current.executeWithErrorHandling(mockAsyncFn);
    });

    expect(returnValue).toBe("success");
    expect(result.current.isError).toBe(false);
  });

  it("should handle async function errors", async () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockAsyncFn = jest.fn().mockRejectedValue(new Error("Async error"));

    let returnValue: string | null = "initial";
    await act(async () => {
      returnValue = await result.current.executeWithErrorHandling(mockAsyncFn);
    });

    expect(returnValue).toBe(null);
    expect(result.current.isError).toBe(true);
  });

  it("should handle form submission with error handling", async () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockSubmitFn = jest.fn().mockResolvedValue("submitted");

    let submitResult: { success: boolean; data?: string; error?: any } = { success: false };
    await act(async () => {
      submitResult = await result.current.submitWithErrorHandling(mockSubmitFn);
    });

    expect(submitResult.success).toBe(true);
    expect(submitResult.data).toBe("submitted");
    expect(result.current.isError).toBe(false);
  });

  it("should handle form submission errors", async () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockSubmitFn = jest.fn().mockRejectedValue("VALIDATION_ERROR");

    let submitResult: { success: boolean; data?: string; error?: any } = { success: true };
    await act(async () => {
      submitResult = await result.current.submitWithErrorHandling(mockSubmitFn);
    });

    expect(submitResult.success).toBe(false);
    expect(submitResult.error?.code).toBe("VALIDATION_ERROR");
    expect(result.current.isError).toBe(true);
  });

  it("should handle API errors", async () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockResponse = {
      json: jest.fn().mockResolvedValue({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Rate limit exceeded",
        },
      }),
    } as unknown as Response;

    await act(async () => {
      await result.current.handleApiError(mockResponse);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});

describe("useParticipationErrorHandler", () => {
  it("should have participation-specific default context", () => {
    const { result } = renderHook(() => useParticipationErrorHandler());

    act(() => {
      result.current.handleError("DUPLICATE_REGISTRATION");
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.code).toBe("DUPLICATE_REGISTRATION");
  });
});
