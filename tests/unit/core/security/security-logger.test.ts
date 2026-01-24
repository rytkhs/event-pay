/**
 * security-logger.ts のユニットテスト
 *
 * テスト項目:
 * U-S-01: IPアドレスのマスク
 * U-S-02: 重要度判定: LOW
 * U-S-03: 重要度判定: HIGH
 * U-S-04: 非同期待機 (Await)
 */

import { logger } from "@core/logging/app-logger";
import { logSecurityEvent } from "@core/security/security-logger";
import type { SecurityEvent } from "@core/security/security-logger";

// Mock dependencies
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@core/utils/cloudflare-env", () => ({
  getEnv: jest.fn(() => ({
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  })),
}));

jest.mock("@supabase/supabase-js", () => {
  const mockInsert = jest.fn().mockReturnValue({
    error: null,
  });

  const mockFrom = jest.fn(() => ({
    insert: mockInsert,
  }));

  return {
    createClient: jest.fn(() => ({
      from: mockFrom,
    })),
  };
});

// EmailNotificationServiceのモック
const mockSendAdminAlert = jest.fn().mockResolvedValue({
  success: true,
  messageId: "test-message-id",
});

jest.mock("@core/notification/email-service", () => ({
  EmailNotificationService: jest.fn().mockImplementation(() => ({
    sendAdminAlert: mockSendAdminAlert,
  })),
}));

describe("security-logger", () => {
  let mockLogger: jest.Mocked<typeof logger>;
  let mockSupabaseInsert: jest.Mock;
  let mockSupabaseClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get mock instances
    mockLogger = logger as jest.Mocked<typeof logger>;

    // Get Supabase mock
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const supabaseModule = require("@supabase/supabase-js");
    mockSupabaseClient = supabaseModule.createClient();
    mockSupabaseInsert = mockSupabaseClient.from().insert;

    // Ensure insert returns a resolved promise
    mockSupabaseInsert.mockResolvedValue({ error: null });

    // Ensure sendAdminAlert returns a resolved promise
    mockSendAdminAlert.mockResolvedValue({
      success: true,
      messageId: "test-message-id",
    });
  });

  describe("U-S-01: IPアドレスのマスク", () => {
    it("IPv4アドレスの第4オクテットをマスクすること", () => {
      const event: SecurityEvent = {
        type: "VALIDATION_FAILURE",
        severity: "LOW",
        message: "Test security event",
        ip: "192.168.1.10",
        timestamp: new Date(),
      };

      logSecurityEvent(event);

      // logger.info が呼ばれることを確認（severity: LOW）
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Test security event",
        expect.objectContaining({
          ip: "192.168.1.xxx",
        })
      );
    });
  });

  describe("U-S-02: 重要度判定: LOW", () => {
    it("DB保存のみ行われ、メール送信関数が呼ばれないこと", async () => {
      const event: SecurityEvent = {
        type: "VALIDATION_FAILURE",
        severity: "LOW",
        message: "Low severity event",
        timestamp: new Date(),
      };

      logSecurityEvent(event);

      // logger.info が呼ばれることを確認
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Low severity event",
        expect.objectContaining({
          security_severity: "LOW",
        })
      );

      // メール送信が呼ばれないことを確認
      // 非同期処理のため、少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendAdminAlert).not.toHaveBeenCalled();
    });
  });

  describe("U-S-03: 重要度判定: HIGH", () => {
    it("DB保存に加え、メール送信関数が呼ばれること", async () => {
      const event: SecurityEvent = {
        type: "XSS_ATTEMPT",
        severity: "HIGH",
        message: "High severity event",
        timestamp: new Date(),
      };

      logSecurityEvent(event);

      // logger.error が呼ばれることを確認（severity: HIGH）
      expect(mockLogger.error).toHaveBeenCalledWith(
        "High severity event",
        expect.objectContaining({
          security_severity: "HIGH",
        })
      );

      // 非同期処理が完了するまで待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      // メール送信が呼ばれることを確認
      expect(mockSendAdminAlert).toHaveBeenCalled();
      expect(mockSendAdminAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringMatching(/Security Alert.*HIGH|HIGH.*Security Alert/),
        })
      );
    });
  });

  describe("U-S-04: 非同期待機 (Await)", () => {
    it("DB保存(logger.error)とメール送信が呼び出されていること", async () => {
      const event: SecurityEvent = {
        type: "MALICIOUS_INPUT",
        severity: "HIGH",
        message: "Async test event",
        timestamp: new Date(),
      };

      // logSecurityEventを呼び出し
      logSecurityEvent(event);

      // 非同期処理が完了するまで待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      // logger.errorが呼ばれることを確認
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Async test event",
        expect.objectContaining({
          security_severity: "HIGH",
          security_type: "MALICIOUS_INPUT",
          category: "security",
        })
      );

      // メール送信が呼ばれることを確認
      expect(mockSendAdminAlert).toHaveBeenCalled();
    });
  });
});
