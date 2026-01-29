/**
 * error-details.ts のユニットテスト
 * クライアント/サーバー両方で使用可能な共通ロジックのテスト
 */

import {
  getErrorDetails,
  getUserErrorMessage,
  handleApiError,
  isRetryableError,
  getErrorSeverity,
  normalizeToErrorDetails,
  ERROR_MAPPINGS,
  type ErrorDetails,
} from "../../../../core/utils/error-details";

describe("error-details", () => {
  describe("getErrorDetails", () => {
    it("既知のエラーコードで正しいErrorDetailsを返す", () => {
      const result = getErrorDetails("VALIDATION_ERROR");

      expect(result).toEqual({
        code: "VALIDATION_ERROR",
        ...ERROR_MAPPINGS["VALIDATION_ERROR"],
      });
    });

    it("未知のエラーコードでUNKNOWN_ERRORを返す", () => {
      const result = getErrorDetails("UNKNOWN_CODE");

      expect(result.code).toBe("UNKNOWN_ERROR");
      expect(result.userMessage).toBe("予期しないエラーが発生しました。");
      expect(result.severity).toBe("medium");
    });
  });

  describe("getUserErrorMessage", () => {
    it("文字列エラーコードからユーザーメッセージを取得", () => {
      const result = getUserErrorMessage("NETWORK_ERROR");
      expect(result).toBe("ネットワークエラーが発生しました。インターネット接続をご確認ください。");
    });

    it("オブジェクトのcodeプロパティからユーザーメッセージを取得", () => {
      const result = getUserErrorMessage({ code: "VALIDATION_ERROR" });
      expect(result).toBe("入力内容に問題があります。正しい形式で入力してください。");
    });

    it("Errorオブジェクトの場合、開発環境では詳細メッセージを返す", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const error = new Error("Detailed error message");
      const result = getUserErrorMessage(error);

      expect(result).toBe("Detailed error message");

      process.env.NODE_ENV = originalEnv;
    });

    it("Errorオブジェクトの場合、本番環境ではフォールバックメッセージを返す", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const error = new Error("Detailed error message");
      const result = getUserErrorMessage(error);

      expect(result).toBe("エラーが発生しました");

      process.env.NODE_ENV = originalEnv;
    });

    it("未知のエラーの場合フォールバックメッセージを返す", () => {
      const result = getUserErrorMessage({ unknown: "value" });
      expect(result).toBe("エラーが発生しました");
    });
  });

  describe("handleApiError", () => {
    it("Problem Detailsレスポンスを処理", async () => {
      const response = new Response(JSON.stringify({ code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { "content-type": "application/problem+json" },
      });

      const result = await handleApiError(response);
      expect(result.code).toBe("VALIDATION_ERROR");
    });

    it("通常JSONレスポンスのcodeを処理", async () => {
      const response = new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });

      const result = await handleApiError(response);
      expect(result.code).toBe("UNAUTHORIZED");
    });

    it("HTTPステータスからフォールバック推測", async () => {
      const response = new Response("Not Found", { status: 404 });

      const result = await handleApiError(response);
      expect(result.code).toBe("NOT_FOUND");
    });

    it("JSONパースエラー時はHTTPステータスから推測", async () => {
      const response = new Response("invalid json", {
        status: 500,
        headers: { "content-type": "application/json" },
      });

      const result = await handleApiError(response);
      expect(result.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("isRetryableError", () => {
    it("リトライ可能なエラーを判定", () => {
      const error = getErrorDetails("NETWORK_ERROR");
      expect(isRetryableError(error)).toBe(true);
    });

    it("リトライ不可能なエラーを判定", () => {
      const error = getErrorDetails("VALIDATION_ERROR");
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe("getErrorSeverity", () => {
    it("重要度を正しく取得", () => {
      const error = getErrorDetails("ENV_VAR_MISSING");
      expect(getErrorSeverity(error)).toBe("critical");
    });
  });

  describe("normalizeToErrorDetails", () => {
    it("文字列エラーコードを正規化", () => {
      const result = normalizeToErrorDetails("VALIDATION_ERROR");
      expect(result.code).toBe("VALIDATION_ERROR");
    });

    it("codeプロパティを持つオブジェクトを正規化", () => {
      const result = normalizeToErrorDetails({ code: "NETWORK_ERROR" });
      expect(result.code).toBe("NETWORK_ERROR");
    });

    it("Supabase AuthErrorのメッセージを正規化", () => {
      const error = { message: "Email not confirmed" };
      const result = normalizeToErrorDetails(error);
      expect(result.code).toBe("VALIDATION_ERROR");
    });

    it("既知のエラーメッセージパターンを正規化", () => {
      const testCases = [
        { message: "already registered", expected: "DUPLICATE_REGISTRATION" },
        { message: "rate limit", expected: "RATE_LIMITED" },
        { message: "Email not confirmed", expected: "VALIDATION_ERROR" },
        { message: "Invalid login credentials", expected: "LOGIN_FAILED" },
      ];

      testCases.forEach(({ message, expected }) => {
        const result = normalizeToErrorDetails({ message });
        expect(result.code).toBe(expected);
      });
    });

    it("未知のエラーをUNKNOWN_ERRORに正規化", () => {
      const result = normalizeToErrorDetails({ unknown: "value" });
      expect(result.code).toBe("UNKNOWN_ERROR");
    });
  });

  describe("ERROR_MAPPINGS", () => {
    it("すべてのエラーマッピングが必須フィールドを持つ", () => {
      const requiredFields = [
        "message",
        "userMessage",
        "severity",
        "shouldLog",
        "shouldAlert",
        "retryable",
      ];

      Object.entries(ERROR_MAPPINGS).forEach(([code, mapping]) => {
        const mappingValue = mapping as Omit<ErrorDetails, "code">;
        requiredFields.forEach((field) => {
          expect(mappingValue).toHaveProperty(field);
        });
      });
    });

    it("重要度が正しい値の範囲内", () => {
      const validSeverities = ["low", "medium", "high", "critical"];

      Object.values(ERROR_MAPPINGS).forEach((mapping) => {
        const mappingValue = mapping as Omit<ErrorDetails, "code">;
        expect(validSeverities).toContain(mappingValue.severity);
      });
    });
  });
});
