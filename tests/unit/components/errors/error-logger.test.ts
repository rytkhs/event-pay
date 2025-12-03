/**
 * ErrorLogger Unit Tests
 * components/errors/error-logger.ts のテスト
 */

import { ErrorLogger } from "@/components/errors/error-logger";
import type { ErrorInfo, ErrorReportingConfig } from "@/components/errors/error-types";

describe("ErrorLogger", () => {
  let logger: ErrorLogger;
  let fetchMock: jest.SpyInstance;
  const originalEnv = process.env;

  const mockConfig: ErrorReportingConfig = {
    enabled: true,
    environment: "production",
    apiEndpoint: "/api/errors",
    sampleRate: 1.0, // Always send for testing
    includeStackTrace: true,
    includeUserInfo: true,
    includeBreadcrumbs: true,
  };

  const mockErrorInfo: ErrorInfo = {
    code: "500",
    category: "server",
    severity: "high",
    title: "Test Error",
    message: "This is a test error",
  };

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "production" };
    logger = new ErrorLogger(mockConfig);

    // Mock fetch API
    fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("U-C-01: パンくずリストの追加", () => {
    it("addBreadcrumb を3回呼び出し、内部配列に3つのイベントが正しい順序で保存されていること", async () => {
      // Arrange
      const breadcrumb1 = {
        category: "navigation",
        message: "ページ遷移1",
        level: "info" as const,
        data: { page: "/page1" },
      };
      const breadcrumb2 = {
        category: "user_action",
        message: "ボタンクリック",
        level: "info" as const,
        data: { button: "submit" },
      };
      const breadcrumb3 = {
        category: "api",
        message: "API呼び出し",
        level: "warning" as const,
        data: { endpoint: "/api/test" },
      };

      // Act
      logger.addBreadcrumb(
        breadcrumb1.category,
        breadcrumb1.message,
        breadcrumb1.level,
        breadcrumb1.data
      );
      logger.addBreadcrumb(
        breadcrumb2.category,
        breadcrumb2.message,
        breadcrumb2.level,
        breadcrumb2.data
      );
      logger.addBreadcrumb(
        breadcrumb3.category,
        breadcrumb3.message,
        breadcrumb3.level,
        breadcrumb3.data
      );

      // logError を呼び出してペイロードを確認
      await logger.logError(mockErrorInfo);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callArgs = fetchMock.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.breadcrumbs).toBeDefined();
      expect(requestBody.breadcrumbs).toHaveLength(3);

      // 順序を確認
      expect(requestBody.breadcrumbs[0]).toMatchObject({
        category: breadcrumb1.category,
        message: breadcrumb1.message,
        level: breadcrumb1.level,
        data: breadcrumb1.data,
      });

      expect(requestBody.breadcrumbs[1]).toMatchObject({
        category: breadcrumb2.category,
        message: breadcrumb2.message,
        level: breadcrumb2.level,
        data: breadcrumb2.data,
      });

      expect(requestBody.breadcrumbs[2]).toMatchObject({
        category: breadcrumb3.category,
        message: breadcrumb3.message,
        level: breadcrumb3.level,
        data: breadcrumb3.data,
      });

      // タイムスタンプも確認
      expect(requestBody.breadcrumbs[0].timestamp).toBeDefined();
      expect(requestBody.breadcrumbs[1].timestamp).toBeDefined();
      expect(requestBody.breadcrumbs[2].timestamp).toBeDefined();
    });
  });

  describe("U-C-02: パンくずリストの上限", () => {
    it("上限(50)を超える回数呼び出し、古いイベントが削除され、最新の50件のみ保持されること", async () => {
      // Arrange & Act
      const totalBreadcrumbs = 55; // 上限50を超える

      // 55個のパンくずを追加
      for (let i = 0; i < totalBreadcrumbs; i++) {
        logger.addBreadcrumb("test", `Breadcrumb ${i}`, "info", { index: i });
      }

      // logError を呼び出してペイロードを確認
      await logger.logError(mockErrorInfo);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callArgs = fetchMock.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      // 最大50件のみ保持されていること
      expect(requestBody.breadcrumbs).toHaveLength(50);

      // 最も古い5つ（index 0-4）は削除されていること
      expect(requestBody.breadcrumbs[0].data.index).toBe(5);

      // 最も新しいものは保持されていること
      expect(requestBody.breadcrumbs[49].data.index).toBe(54);

      // 順序が正しく保たれていることを確認
      for (let i = 0; i < 50; i++) {
        expect(requestBody.breadcrumbs[i].data.index).toBe(i + 5);
        expect(requestBody.breadcrumbs[i].message).toBe(`Breadcrumb ${i + 5}`);
      }
    });
  });

  describe("U-C-03: 送信ペイロードの生成", () => {
    it("logError 実行時、パンくずリスト、ユーザー情報、URL等が正しくJSONに含まれていること", async () => {
      // Arrange
      const mockContext = {
        userId: "user_123",
        userEmail: "test@example.com",
        url: "https://example.com/test",
        pathname: "/test",
        userAgent: "Mozilla/5.0 Test Browser",
        referrer: "https://example.com/previous",
      };

      const mockError = new Error("Test error with stack");

      // パンくずリストを追加
      logger.addBreadcrumb("navigation", "ページ読み込み", "info", { page: "/test" });
      logger.addBreadcrumb("user_action", "フォーム送信", "warning", { form: "contact" });

      // Act
      await logger.logError(mockErrorInfo, mockError, mockContext);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callArgs = fetchMock.mock.calls[0];
      const [url, options] = callArgs;

      // エンドポイント確認
      expect(url).toBe("/api/errors");

      // リクエストヘッダー確認
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.keepalive).toBe(true);

      // リクエストボディ確認
      const requestBody = JSON.parse(options.body);

      // エラー情報
      expect(requestBody.error).toMatchObject({
        code: mockErrorInfo.code,
        category: mockErrorInfo.category,
        severity: mockErrorInfo.severity,
        title: mockErrorInfo.title,
        message: mockErrorInfo.message,
      });

      // スタックトレース（includeStackTrace: true）
      expect(requestBody.stackTrace).toBeDefined();
      expect(requestBody.stackTrace).toContain("Test error with stack");

      // ユーザー情報（includeUserInfo: true）
      expect(requestBody.user).toBeDefined();
      expect(requestBody.user).toMatchObject({
        id: mockContext.userId,
        email: mockContext.userEmail,
        userAgent: mockContext.userAgent,
      });

      // ページ情報
      expect(requestBody.page).toBeDefined();
      expect(requestBody.page).toMatchObject({
        url: mockContext.url,
        pathname: mockContext.pathname,
        referrer: mockContext.referrer,
      });

      // パンくずリスト（includeBreadcrumbs: true）
      expect(requestBody.breadcrumbs).toBeDefined();
      expect(requestBody.breadcrumbs).toHaveLength(2);
      expect(requestBody.breadcrumbs[0]).toMatchObject({
        category: "navigation",
        message: "ページ読み込み",
        level: "info",
        data: { page: "/test" },
      });
      expect(requestBody.breadcrumbs[1]).toMatchObject({
        category: "user_action",
        message: "フォーム送信",
        level: "warning",
        data: { form: "contact" },
      });

      // 環境情報
      expect(requestBody.environment).toBe("production");
    });

    it("設定でincludeUserInfo=falseの場合、ユーザー情報が含まれないこと", async () => {
      // Arrange
      const configWithoutUserInfo: ErrorReportingConfig = {
        ...mockConfig,
        includeUserInfo: false,
      };
      const loggerWithoutUserInfo = new ErrorLogger(configWithoutUserInfo);

      const mockContext = {
        userId: "user_123",
        userEmail: "test@example.com",
      };

      // Act
      await loggerWithoutUserInfo.logError(mockErrorInfo, undefined, mockContext);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

      // ユーザー情報が含まれていないこと
      expect(requestBody.user).toBeUndefined();
    });

    it("設定でincludeBreadcrumbs=falseの場合、パンくずリストが含まれないこと", async () => {
      // Arrange
      const configWithoutBreadcrumbs: ErrorReportingConfig = {
        ...mockConfig,
        includeBreadcrumbs: false,
      };
      const loggerWithoutBreadcrumbs = new ErrorLogger(configWithoutBreadcrumbs);

      loggerWithoutBreadcrumbs.addBreadcrumb("test", "test message", "info");

      // Act
      await loggerWithoutBreadcrumbs.logError(mockErrorInfo);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

      // パンくずリストが含まれていないこと
      expect(requestBody.breadcrumbs).toBeUndefined();
    });

    it("設定でincludeStackTrace=falseの場合、スタックトレースが含まれないこと", async () => {
      // Arrange
      const configWithoutStackTrace: ErrorReportingConfig = {
        ...mockConfig,
        includeStackTrace: false,
      };
      const loggerWithoutStackTrace = new ErrorLogger(configWithoutStackTrace);

      const mockError = new Error("Test error");

      // Act
      await loggerWithoutStackTrace.logError(mockErrorInfo, mockError);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

      // スタックトレースが含まれていないこと
      expect(requestBody.stackTrace).toBeUndefined();
    });
  });
});
