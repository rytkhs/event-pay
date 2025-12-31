/**
 * CSPレポートAPI統合テスト
 *
 * /api/csp-report エンドポイントのリクエストからセキュリティログ保存までのフローを検証
 */

import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";

describe("CSPレポートAPI統合テスト (/api/csp-report)", () => {
  let mockLogger: { warn: jest.Mock; error: jest.Mock; info: jest.Mock; debug: jest.Mock };
  let mockEnforceRateLimit: jest.Mock;
  let mockLogSecurityEvent: jest.Mock;
  let cspReportHandler: any;
  let NextRequest: any;

  beforeEach(async () => {
    jest.resetModules();

    // Logger Mock
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
    jest.doMock("@core/logging/app-logger", () => ({
      logger: mockLogger,
    }));

    // Rate Limit Mock
    mockEnforceRateLimit = jest.fn().mockResolvedValue({ allowed: true });
    jest.doMock("@core/rate-limit", () => ({
      enforceRateLimit: mockEnforceRateLimit,
      buildKey: jest.fn(() => "test-key"),
    }));

    // Security Logger Mock
    mockLogSecurityEvent = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@core/security/security-logger", () => ({
      logSecurityEvent: mockLogSecurityEvent,
    }));

    // Next Server Mock
    jest.doMock("next/server", () => {
      const actual = jest.requireActual("next/server");
      return {
        ...actual,
        NextResponse: class {
          status: number;
          headers: Headers;
          body: any;
          constructor(body: any, init?: ResponseInit) {
            this.body = body;
            this.status = init?.status ?? 200;
            this.headers = new Headers(init?.headers);
          }
          static json(body: any, init?: ResponseInit) {
            return new this(JSON.stringify(body), {
              ...init,
              headers: {
                ...init?.headers,
                "content-type": "application/json",
              },
            });
          }
        },
      };
    });

    // Import modules
    const nextServer = require("next/server");
    NextRequest = nextServer.NextRequest;

    const module = await import("@/app/api/csp-report/route");
    cspReportHandler = module.POST;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * I-C-01: 正常系 - CSPレポート受信
   */
  test("I-C-01: 正常系 - CSPレポートが正しくセキュリティログに保存される", async () => {
    // CSPレポートペイロード
    const cspReport = {
      "csp-report": {
        "blocked-uri": "https://malicious.example.com/script.js",
        "violated-directive": "script-src",
        "effective-directive": "script-src",
        "document-uri": "https://example.com/page",
        referrer: "https://example.com",
        "line-number": 10,
        "column-number": 5,
        "source-file": "https://example.com/page",
        "status-code": 200,
        sample: "console.log('malicious');",
        "original-policy": "default-src 'self'; script-src 'self'",
      },
    };

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": "application/csp-report",
        "x-forwarded-for": "203.0.113.1",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify(cspReport),
    });

    // APIハンドラー実行
    const response = await cspReportHandler(request);

    // レスポンス検証
    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-ID")).toBeTruthy();

    // logSecurityEvent が呼ばれたことを検証
    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
    const logArgs = mockLogSecurityEvent.mock.calls[0][0];

    // ログ引数を検証
    expect(logArgs).toMatchObject({
      type: "CSP_VIOLATION",
      severity: "MEDIUM",
      message: "CSP violation detected",
      details: {
        blocked_uri: "https://malicious.example.com/script.js",
        violated_directive: "script-src",
        effective_directive: "script-src",
        document_uri: "https://example.com/page",
        referrer: "https://example.com",
        line_number: 10,
        column_number: 5,
        source_file: "https://example.com/page",
        status_code: 200,
        sample: "console.log('malicious');",
        original_policy: "default-src 'self'; script-src 'self'",
      },
      userAgent: "Mozilla/5.0",
      ip: "203.0.113.1",
    });
    expect(logArgs.timestamp).toBeInstanceOf(Date);
  });

  /**
   * I-C-04: Reporting API (v3) 形式 - 正常系
   */
  test("I-C-04: Reporting API (v3) 形式 - 配列形式のCSPレポートが正しく処理される", async () => {
    // Reporting API ペイロード
    const reports = [
      {
        type: "csp-violation",
        age: 10,
        url: "https://example.com/vulnerable-page",
        user_agent: "Mozilla/5.0",
        body: {
          blockedURL: "http://evil.com/script.js",
          disposition: "enforce",
          documentURL: "https://example.com/page",
          effectiveDirective: "script-src",
          lineNumber: 15,
          originalPolicy: "script-src 'self'",
          referrer: "https://example.com",
          sample: "",
          statusCode: 200,
          sourceFile: "https://example.com/page",
        },
      },
    ];

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": "application/reports+json",
        "x-forwarded-for": "203.0.113.1",
      },
      body: JSON.stringify(reports),
    });

    // APIハンドラー実行
    const response = await cspReportHandler(request);

    // レスポンス検証
    expect(response.status).toBe(204);

    // logSecurityEvent が呼ばれたことを検証
    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
    const logArgs = mockLogSecurityEvent.mock.calls[0][0];

    // ログ引数を検証
    expect(logArgs).toMatchObject({
      type: "CSP_VIOLATION",
      severity: "MEDIUM",
      message: "CSP violation detected",
      details: {
        blocked_uri: "http://evil.com/script.js",
        effective_directive: "script-src",
        violated_directive: "script-src", // Reporting APIからの変換ロジックでeffectiveDirectiveが入る
        document_uri: "https://example.com/page",
        referrer: "https://example.com",
        line_number: 15,
        original_policy: "script-src 'self'",
        disposition: "enforce",
      },
      ip: "203.0.113.1",
    });
  });

  /**
   * I-C-02: 不正なContent-Type
   */
  test("I-C-02: 不正なContent-Type - 警告ログを出力して204を返す", async () => {
    // CSPレポートペイロード
    const cspReport = {
      "csp-report": {
        "blocked-uri": "https://example.com/bad.js",
        "violated-directive": "script-src",
        "document-uri": "https://example.com/page",
      },
    };

    // リクエスト作成（Content-Typeが不正）
    const request = new NextRequest("https://example.com/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": "text/plain", // 不正なContent-Type
        "x-forwarded-for": "203.0.113.1",
      },
      body: JSON.stringify(cspReport),
    });

    // APIハンドラー実行
    const response = await cspReportHandler(request);

    // レスポンス検証（ブラウザエラー回避のため204を返す）
    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    // 警告ログが出力されたことを検証
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "CSP report invalid content-type",
      expect.objectContaining({
        category: "security",
        action: "cspReportInvalidContentType",
        content_type: "text/plain",
        ip: "203.0.113.1",
      })
    );

    // セキュリティログは保存される（Content-Typeが違っても処理は続行）
    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
  });

  /**
   * I-C-03: ペイロードサイズ超過
   */
  test("I-C-03: ペイロードサイズ超過 - 413エラーを返す", async () => {
    // 巨大なペイロード（10KB超）を生成
    const largePayload = {
      "csp-report": {
        "blocked-uri": "https://example.com/script.js",
        "violated-directive": "script-src",
        sample: "a".repeat(11 * 1024), // 11KB
      },
    };

    const payloadString = JSON.stringify(largePayload);

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": "application/csp-report",
        "content-length": String(payloadString.length),
        "x-forwarded-for": "203.0.113.1",
      },
      body: payloadString,
    });

    // APIハンドラー実行
    const response = await cspReportHandler(request);

    // レスポンス検証
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    // 警告ログが出力されたことを検証
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "CSP report payload too large",
      expect.objectContaining({
        category: "security",
        action: "cspReportPayloadTooLarge",
        max_size: 10 * 1024,
      })
    );

    // セキュリティログは保存されない
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });

  /**
   * 追加テスト: レート制限発動時の挙動
   */
  test("追加: レート制限発動 - 429エラーとRetry-Afterヘッダー", async () => {
    // レート制限モックの設定（制限超過）
    mockEnforceRateLimit.mockResolvedValue({
      allowed: false,
      retryAfter: 60,
    });

    // CSPレポートペイロード
    const cspReport = {
      "csp-report": {
        "blocked-uri": "https://example.com/script.js",
        "violated-directive": "script-src",
      },
    };

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": "application/csp-report",
        "x-forwarded-for": "203.0.113.1",
      },
      body: JSON.stringify(cspReport),
    });

    // APIハンドラー実行
    const response = await cspReportHandler(request);

    // レスポンス検証
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    // 警告ログが出力されたことを検証
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "CSP report rate limited",
      expect.objectContaining({
        category: "security",
        action: "cspReportRateLimited",
        ip: "203.0.113.1",
        retry_after: 60,
      })
    );

    // セキュリティログは保存されない
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });

  /**
   * 追加テスト: JSONパースエラー
   */
  test("追加: JSONパースエラー - 400エラーを返す", async () => {
    // 不正なJSON
    const invalidJSON = "{ invalid json }";

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": "application/csp-report",
        "x-forwarded-for": "203.0.113.1",
      },
      body: invalidJSON,
    });

    // APIハンドラー実行
    const response = await cspReportHandler(request);

    // レスポンス検証
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    // 警告ログが出力されたことを検証
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "CSP report JSON parse error",
      expect.objectContaining({
        category: "security",
        action: "cspReportParseError",
        ip: "203.0.113.1",
      })
    );

    // セキュリティログは保存されない
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });

  /**
   * 追加テスト: csp-reportフィールドが欠けている
   */
  test("追加: csp-reportフィールドが欠けている - 400エラーを返す", async () => {
    // csp-reportフィールドが欠けているペイロード
    const invalidReport = {
      "not-csp-report": {
        "blocked-uri": "https://example.com/script.js",
      },
    };

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": "application/csp-report",
        "x-forwarded-for": "203.0.113.1",
      },
      body: JSON.stringify(invalidReport),
    });

    // APIハンドラー実行
    const response = await cspReportHandler(request);

    // レスポンス検証
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    // 警告ログが出力されたことを検証
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "CSP report missing csp-report field or invalid format",
      expect.objectContaining({
        category: "security",
        action: "cspReportInvalidFormat",
        ip: "203.0.113.1",
      })
    );

    // セキュリティログは保存されない
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });
});
