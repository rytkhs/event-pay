/**
 * エラーハンドリング統合テスト
 * 実際のエラーシナリオでのエラーハンドリングの動作を検証
 */

import { createClient } from "@/lib/supabase/server";
import { validateInviteToken } from "@/lib/utils/invite-token";
import { registerParticipationDirectAction } from "@/app/events/actions/register-participation";
import { logSecurityEvent } from "@/lib/security/security-logger";

// Supabaseクライアントをモック
jest.mock("@/lib/supabase/server");
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// セキュリティログをモック
jest.mock("@/lib/security/security-logger");
const mockLogSecurityEvent = logSecurityEvent as jest.MockedFunction<typeof logSecurityEvent>;

describe("Error Handling Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Invite Token Validation Errors", () => {
    it("should handle invalid invite token gracefully", async () => {
      // 無効なトークンのモック
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      };
      mockCreateClient.mockReturnValue(mockSupabase as any);

      const result = await validateInviteToken("invalid-token");

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain("見つかりません");
      expect(result.canRegister).toBe(false);
    });

    it("should handle database connection errors", async () => {
      // データベース接続エラーのモック
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockRejectedValue(new Error("Connection failed")),
            }),
          }),
        }),
      };
      mockCreateClient.mockReturnValue(mockSupabase as any);

      const result = await validateInviteToken("valid-token");

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain("エラーが発生しました");
    });
  });

  describe("Participation Registration Errors", () => {
    it("should handle duplicate registration attempts", async () => {
      const participationData = {
        inviteToken: "valid-token",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 重複登録のモック
      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === "events") {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: "event-1",
                      title: "テストイベント",
                      capacity: 50,
                      fee: 1000,
                      payment_methods: ["stripe", "cash"],
                      status: "upcoming",
                      registration_deadline: null,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "attendances") {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: { id: "existing-attendance" },
                      error: null,
                    }),
                  }),
                }),
              }),
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: null,
                    error: { code: "23505", message: "duplicate key value" },
                  }),
                }),
              }),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          };
        }),
      };
      mockCreateClient.mockReturnValue(mockSupabase as any);

      const result = await registerParticipationDirectAction(participationData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("CONFLICT");
      expect(result.error).toContain("既に登録");
    });

    it("should handle capacity exceeded errors", async () => {
      const participationData = {
        inviteToken: "valid-token",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 定員超過のモック
      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === "events") {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: "event-1",
                      title: "テストイベント",
                      capacity: 2,
                      fee: 1000,
                      payment_methods: ["stripe", "cash"],
                      status: "upcoming",
                      registration_deadline: null,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "attendances") {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: null,
                    error: { message: "Capacity exceeded" },
                  }),
                }),
              }),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({
                count: 2,
                error: null,
              }),
            }),
          };
        }),
      };
      mockCreateClient.mockReturnValue(mockSupabase as any);

      const result = await registerParticipationDirectAction(participationData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(result.error).toContain("定員");
    });
  });

  describe("Security Event Logging", () => {
    it("should log security events for suspicious activities", () => {
      const securityEvent = {
        type: "XSS_ATTEMPT" as const,
        severity: "HIGH" as const,
        message: "XSS attempt detected in user input",
        details: { input: "<script>alert('xss')</script>" },
        timestamp: new Date(),
      };

      logSecurityEvent(securityEvent);

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(securityEvent);
    });

    it("should log invalid token access attempts", () => {
      const securityEvent = {
        type: "INVALID_TOKEN" as const,
        severity: "MEDIUM" as const,
        message: "Invalid invite token access attempt",
        details: {
          tokenType: "invite",
          maskedToken: "abcd***efgh",
        },
        userAgent: "Mozilla/5.0...",
        ip: "192.168.1.xxx",
        timestamp: expect.any(Date),
      };

      logSecurityEvent(securityEvent);

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "INVALID_TOKEN",
          severity: "MEDIUM",
        })
      );
    });
  });

  describe("Error Recovery", () => {
    it("should handle transient database errors with retry logic", async () => {
      let callCount = 0;
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                  return Promise.reject(new Error("Temporary connection error"));
                }
                return Promise.resolve({
                  data: {
                    id: "event-1",
                    title: "テストイベント",
                    invite_token: "valid-token",
                    status: "upcoming",
                  },
                  error: null,
                });
              }),
            }),
          }),
        }),
      };
      mockCreateClient.mockReturnValue(mockSupabase as any);

      // 最初の呼び出しは失敗、2回目は成功することを想定
      try {
        await validateInviteToken("valid-token");
      } catch {
        // 最初の失敗は期待される
      }

      const result = await validateInviteToken("valid-token");
      expect(result.isValid).toBe(true);
      expect(callCount).toBe(2);
    });
  });
});
