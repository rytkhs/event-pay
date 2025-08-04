/**
 * EventPay 監査エラーハンドリング テスト
 *
 * 監査ログの失敗がビジネスロジックに与える影響をテスト
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import {
  RLSBasedGuestValidator,
  getGuestTokenValidator,
} from "@/lib/security/secure-client-factory.impl";
import { GuestErrorCode } from "@/lib/security/secure-client-factory.types";

// モック設定
jest.mock("@/lib/security/security-auditor.impl", () => ({
  SecurityAuditorImpl: jest.fn().mockImplementation(() => ({
    logGuestAccess: jest.fn(),
    logAdminAccess: jest.fn(),
  })),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  }),
}));

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  }),
  createBrowserClient: jest.fn().mockReturnValue({}),
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  }),
}));

describe("監査エラーハンドリング", () => {
  let validator: RLSBasedGuestValidator;
  let mockAuditor: any;

  beforeEach(() => {
    // 環境変数を設定
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    validator = getGuestTokenValidator() as RLSBasedGuestValidator;

    // モックされた監査機能にアクセス
    const SecurityAuditorImpl = require("@/lib/security/security-auditor.impl").SecurityAuditorImpl;
    mockAuditor = new SecurityAuditorImpl();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("ゲストトークンバリデーション時の監査エラー", () => {
    it("監査ログ失敗時でもバリデーション結果を正しく返すべき", async () => {
      // 監査ログが失敗するようにモック
      mockAuditor.logGuestAccess.mockRejectedValue(new Error("Database connection failed"));

      const invalidToken = "invalid-token";

      // バリデーションは監査ログの失敗に関係なく動作するべき
      const result = await validator.validateToken(invalidToken);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(GuestErrorCode.INVALID_FORMAT);
      expect(result.canModify).toBe(false);

      // 監査ログが呼び出されたことを確認（失敗したが）
      expect(mockAuditor.logGuestAccess).toHaveBeenCalledWith(
        invalidToken,
        "VALIDATE_TOKEN",
        {},
        false,
        { errorCode: GuestErrorCode.INVALID_FORMAT }
      );
    });

    it("有効なトークンでも監査ログ失敗時にバリデーション結果を返すべき", async () => {
      // 監査ログが失敗するようにモック
      mockAuditor.logGuestAccess.mockRejectedValue(new Error("Audit service unavailable"));

      // Supabaseクライアントが有効なデータを返すようにモック
      const mockClient = require("@supabase/supabase-js").createClient();
      mockClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: "attendance-123",
              event_id: "event-456",
              status: "confirmed",
              event: {
                id: "event-456",
                date: new Date(Date.now() + 86400000).toISOString(), // 明日
                registration_deadline: new Date(Date.now() + 43200000).toISOString(), // 12時間後
                status: "active",
              },
            },
            error: null,
          }),
        }),
      });

      const validToken = "gst_" + "a".repeat(32);

      // バリデーションは監査ログの失敗に関係なく動作するべき
      const result = await validator.validateToken(validToken);

      expect(result.isValid).toBe(true);
      expect(result.attendanceId).toBe("attendance-123");
      expect(result.eventId).toBe("event-456");
      expect(result.canModify).toBe(true);

      // 監査ログが複数回呼び出されたことを確認（すべて失敗したが）
      expect(mockAuditor.logGuestAccess).toHaveBeenCalled();
    });

    it("コンソール警告が出力されることを確認", async () => {
      // console.warnをモック
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      // 監査ログが失敗するようにモック
      mockAuditor.logGuestAccess.mockRejectedValue(new Error("Network error"));

      const invalidToken = "invalid-token";

      await validator.validateToken(invalidToken);

      // コンソール警告が出力されたことを確認
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to log guest access audit:",
        expect.objectContaining({
          token: "invalid-t...",
          action: "VALIDATE_TOKEN",
          success: false,
          auditError: "Network error",
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe("セキュリティ考慮事項", () => {
    it("監査ログ失敗時でもトークンの一部のみがログに記録されるべき", async () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      mockAuditor.logGuestAccess.mockRejectedValue(new Error("Audit failed"));

      const sensitiveToken = "abcdefghijklmnopqrstuvwxyz123456";

      await validator.validateToken(sensitiveToken);

      // トークンの最初の8文字のみがログに記録されることを確認
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to log guest access audit:",
        expect.objectContaining({
          token: "abcdefgh...", // 最初の8文字 + '...'
        })
      );

      consoleSpy.mockRestore();
    });

    it("監査エラーの詳細が適切にログに記録されるべき", async () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const auditError = new Error("Database connection timeout");
      mockAuditor.logGuestAccess.mockRejectedValue(auditError);

      const token = "gst_" + "a".repeat(32);

      await validator.validateToken(token);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to log guest access audit:",
        expect.objectContaining({
          auditError: "Database connection timeout",
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe("パフォーマンス考慮事項", () => {
    it("監査ログ失敗がバリデーション処理時間に大きく影響しないべき", async () => {
      // 監査ログが遅延して失敗するようにモック
      mockAuditor.logGuestAccess.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error("Slow failure")), 100))
      );

      const token = "invalid-token";

      const startTime = Date.now();
      const result = await validator.validateToken(token);
      const endTime = Date.now();

      // バリデーション結果は正しく返される
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(GuestErrorCode.INVALID_FORMAT);

      // 処理時間が合理的な範囲内（監査ログの遅延を含めても）
      expect(endTime - startTime).toBeLessThan(1000); // 1秒以内
    });
  });
});
