/**
 * セキュリティログ記録システムのテスト
 */

import {
  logSecurityEvent,
  logParticipationSecurityEvent,
  logSanitizationEvent,
  logDuplicateRegistrationAttempt,
  logValidationFailure,
  logInvalidTokenAccess,
  type SecurityEvent,
} from "@/lib/security/security-logger";

// console.warnとconsole.errorをモック
const mockConsoleWarn = jest.spyOn(console, "warn").mockImplementation();
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();

describe("セキュリティログ記録システム", () => {
  beforeEach(() => {
    mockConsoleWarn.mockClear();
    mockConsoleError.mockClear();
  });

  afterAll(() => {
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe("logSecurityEvent", () => {
    it("開発環境でセキュリティイベントをログに記録する", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const event: SecurityEvent = {
        type: "XSS_ATTEMPT",
        severity: "HIGH",
        message: "XSS attack detected",
        timestamp: new Date(),
        ip: "192.168.1.100",
        userAgent: "Mozilla/5.0",
      };

      logSecurityEvent(event);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "[SECURITY HIGH] XSS_ATTEMPT:",
        expect.objectContaining({
          type: "XSS_ATTEMPT",
          severity: "HIGH",
          message: "XSS attack detected",
          ip: "192.168.1.xxx", // IPがマスクされている
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it("重要度が高い場合はアラートを送信する", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const event: SecurityEvent = {
        type: "MALICIOUS_INPUT",
        severity: "CRITICAL",
        message: "Critical security event",
        timestamp: new Date(),
      };

      logSecurityEvent(event);

      // CRITICALレベルの場合はアラートも出力される
      expect(mockConsoleError).toHaveBeenCalledWith(
        "🚨 SECURITY ALERT:",
        expect.objectContaining({
          type: "MALICIOUS_INPUT",
          severity: "CRITICAL",
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("logParticipationSecurityEvent", () => {
    it("参加登録関連のセキュリティイベントを記録する", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      logParticipationSecurityEvent(
        "DUPLICATE_REGISTRATION",
        "Duplicate registration attempt",
        { eventId: "test-event-123" },
        {
          userAgent: "Mozilla/5.0",
          ip: "10.0.0.1",
          eventId: "test-event-123",
        }
      );

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "[SECURITY MEDIUM] DUPLICATE_REGISTRATION:",
        expect.objectContaining({
          type: "DUPLICATE_REGISTRATION",
          severity: "MEDIUM",
          message: "Duplicate registration attempt",
          details: { eventId: "test-event-123" },
          ip: "10.0.0.xxx",
          eventId: "test-event-123",
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("logSanitizationEvent", () => {
    it("サニタイゼーションが実行された場合のみログを記録する", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      // サニタイゼーションが実行された場合
      logSanitizationEvent(
        "<script>alert('xss')</script>Hello",
        "Hello",
        "nickname",
        { ip: "127.0.0.1" }
      );

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "[SECURITY LOW] SANITIZATION_TRIGGERED:",
        expect.objectContaining({
          type: "SANITIZATION_TRIGGERED",
          message: "Input sanitization applied to field: nickname",
          details: expect.objectContaining({
            fieldName: "nickname",
            hasScriptTag: true,
            hasHtmlTags: true,
          }),
        })
      );

      mockConsoleWarn.mockClear();

      // サニタイゼーションが不要だった場合
      logSanitizationEvent(
        "Hello World",
        "Hello World",
        "nickname",
        { ip: "127.0.0.1" }
      );

      // ログは記録されない
      expect(mockConsoleWarn).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("logDuplicateRegistrationAttempt", () => {
    it("重複登録試行をログに記録する", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      logDuplicateRegistrationAttempt(
        "test@example.com",
        "event-123",
        { userAgent: "Mozilla/5.0", ip: "192.168.1.1" }
      );

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "[SECURITY MEDIUM] DUPLICATE_REGISTRATION:",
        expect.objectContaining({
          type: "DUPLICATE_REGISTRATION",
          message: "Duplicate registration attempt detected",
          details: expect.objectContaining({
            maskedEmail: "te***@example.com",
            eventId: "event-123",
          }),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("logValidationFailure", () => {
    it("バリデーション失敗をログに記録する", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      logValidationFailure(
        "email",
        "Invalid email format",
        "invalid-email",
        { ip: "10.0.0.1" }
      );

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "[SECURITY LOW] VALIDATION_FAILURE:",
        expect.objectContaining({
          type: "VALIDATION_FAILURE",
          message: "Validation failed for field: email",
          details: expect.objectContaining({
            fieldName: "email",
            errorMessage: "Invalid email format",
            inputLength: 13,
          }),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("logInvalidTokenAccess", () => {
    it("無効なトークンアクセスをログに記録する", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      logInvalidTokenAccess(
        "invalid-token-12345678",
        "invite",
        { userAgent: "Mozilla/5.0", ip: "172.16.0.1" }
      );

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "[SECURITY MEDIUM] INVALID_TOKEN:",
        expect.objectContaining({
          type: "INVALID_TOKEN",
          message: "Invalid invite token access attempt",
          details: expect.objectContaining({
            tokenType: "invite",
            maskedToken: "inva***5678",
          }),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("IPアドレスマスキング", () => {
    it("IPv4アドレスを正しくマスクする", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const event: SecurityEvent = {
        type: "RATE_LIMIT_EXCEEDED",
        severity: "MEDIUM",
        message: "Rate limit exceeded",
        timestamp: new Date(),
        ip: "203.0.113.195",
      };

      logSecurityEvent(event);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "[SECURITY MEDIUM] RATE_LIMIT_EXCEEDED:",
        expect.objectContaining({
          ip: "203.0.113.xxx",
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it("IPv6アドレスを正しくマスクする", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const event: SecurityEvent = {
        type: "SUSPICIOUS_ACTIVITY",
        severity: "HIGH",
        message: "Suspicious activity detected",
        timestamp: new Date(),
        ip: "2001:db8:85a3:0:0:8a2e:370:7334",
      };

      logSecurityEvent(event);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "[SECURITY HIGH] SUSPICIOUS_ACTIVITY:",
        expect.objectContaining({
          ip: "2001:db8:85a3:0:0:8a2e:370:xxxx",
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });
});