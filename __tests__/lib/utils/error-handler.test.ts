import {
  getErrorDetails,
  getUserErrorMessage,
  handleClientError,
  isRetryableError,
  getErrorSeverity,
} from "@/lib/utils/error-handler";

describe("Error Handler", () => {
  describe("getErrorDetails", () => {
    it("should return correct error details for known error codes", () => {
      const details = getErrorDetails("INVALID_TOKEN");

      expect(details.code).toBe("INVALID_TOKEN");
      expect(details.userMessage).toBe("無効な招待リンクです。正しいリンクをご確認ください。");
      expect(details.severity).toBe("medium");
      expect(details.shouldLog).toBe(true);
      expect(details.retryable).toBe(false);
    });

    it("should return unknown error details for unknown error codes", () => {
      const details = getErrorDetails("UNKNOWN_CODE");

      expect(details.code).toBe("UNKNOWN_ERROR");
      expect(details.userMessage).toBe("予期しないエラーが発生しました。");
      expect(details.severity).toBe("medium");
      expect(details.shouldLog).toBe(true);
      expect(details.retryable).toBe(true);
    });
  });

  describe("getUserErrorMessage", () => {
    it("should return user message for string error code", () => {
      const message = getUserErrorMessage("NETWORK_ERROR");
      expect(message).toBe("ネットワークエラーが発生しました。インターネット接続をご確認ください。");
    });

    it("should return user message for error object with code", () => {
      const error = { code: "VALIDATION_ERROR" };
      const message = getUserErrorMessage(error);
      expect(message).toBe("入力内容に問題があります。正しい形式で入力してください。");
    });

    it("should return Error message in development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const error = new Error("Test error message");
      const message = getUserErrorMessage(error);
      expect(message).toBe("Test error message");

      process.env.NODE_ENV = originalEnv;
    });

    it("should return fallback message for unknown errors", () => {
      const message = getUserErrorMessage(null);
      expect(message).toBe("エラーが発生しました");
    });

    it("should return custom fallback message", () => {
      const message = getUserErrorMessage(null, "カスタムエラー");
      expect(message).toBe("カスタムエラー");
    });
  });

  describe("handleClientError", () => {
    it("should handle network errors", () => {
      const networkError = new TypeError("fetch failed");
      const details = handleClientError(networkError);

      expect(details.code).toBe("NETWORK_ERROR");
      expect(details.userMessage).toContain("ネットワークエラー");
    });

    it("should handle string error codes", () => {
      const details = handleClientError("RATE_LIMIT_EXCEEDED");

      expect(details.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(details.userMessage).toContain("アクセス頻度");
    });

    it("should handle error objects with code", () => {
      const error = { code: "DUPLICATE_REGISTRATION" };
      const details = handleClientError(error);

      expect(details.code).toBe("DUPLICATE_REGISTRATION");
      expect(details.userMessage).toContain("既に登録");
    });

    it("should handle unknown errors", () => {
      const details = handleClientError(new Error("Unknown error"));

      expect(details.code).toBe("UNKNOWN_ERROR");
      expect(details.userMessage).toBe("予期しないエラーが発生しました。");
    });
  });

  describe("isRetryableError", () => {
    it("should return true for retryable errors", () => {
      const details = getErrorDetails("NETWORK_ERROR");
      expect(isRetryableError(details)).toBe(true);
    });

    it("should return false for non-retryable errors", () => {
      const details = getErrorDetails("INVALID_TOKEN");
      expect(isRetryableError(details)).toBe(false);
    });
  });

  describe("getErrorSeverity", () => {
    it("should return correct severity levels", () => {
      expect(getErrorSeverity(getErrorDetails("XSS_ATTEMPT"))).toBe("high");
      expect(getErrorSeverity(getErrorDetails("DUPLICATE_REGISTRATION"))).toBe("medium");
      expect(getErrorSeverity(getErrorDetails("VALIDATION_ERROR"))).toBe("low");
    });
  });
});