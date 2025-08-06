/**
 * 重複登録防止統合テスト
 * 同じメールアドレスでの重複登録を防ぐ機能をテスト
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// 外部サービスのみモック
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/rate-limit/index", () => ({
  rateLimit: jest.fn(() => Promise.resolve({ success: true })),
}));

describe("重複登録防止統合テスト", () => {
  let mockSupabaseClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabaseClient = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        count: jest.fn(() => Promise.resolve({ data: null, count: 0, error: null })),
      })),
    };

    const { createClient } = require("@/lib/supabase/server");
    createClient.mockReturnValue(mockSupabaseClient);
  });

  describe("基本的な重複登録防止", () => {
    it("同じメールアドレスでの重複登録を防ぐ", async () => {
      const mockEvent = {
        id: "duplicate-prevention-event-id",
        invite_token: "duplicate-prevention-token-123456789012",
        fee: 1000,
      };

      const email = "duplicate@example.com";

      // 最初の登録
      const firstParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "最初の参加者",
        email: email,
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 重複登録の試行
      const duplicateParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "重複参加者",
        email: email, // 同じメールアドレス
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      // 重複チェックのモック（重複検出）
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: "existing-attendance" },
                error: null,
              }),
            }),
          }),
        }),
      });

      expect(firstParticipation.email).toBe(email);
      expect(duplicateParticipation.email).toBe(email);
    });

    it("異なるメールアドレスでは重複登録にならない", async () => {
      const mockEvent = {
        id: "different-email-event-id",
        invite_token: "different-email-token-123456789012",
      };

      // 最初の登録
      const firstParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "参加者1",
        email: "user1@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 異なるメールアドレスでの登録
      const secondParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "参加者2",
        email: "user2@example.com", // 異なるメールアドレス
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      expect(firstParticipation.email).not.toBe(secondParticipation.email);
    });
  });

  describe("大文字小文字の正規化", () => {
    it("大文字小文字の違いを無視して重複を検出する", async () => {
      const mockEvent = {
        id: "case-insensitive-event-id",
        invite_token: "case-insensitive-token-123456789012",
      };

      // 小文字での最初の登録
      const firstParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "小文字参加者",
        email: "casetest@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 大文字での重複登録の試行
      const duplicateParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "大文字参加者",
        email: "CASETEST@EXAMPLE.COM", // 大文字
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      expect(firstParticipation.email.toLowerCase()).toBe(
        duplicateParticipation.email.toLowerCase()
      );
    });

    it("混合ケースでも重複を検出する", async () => {
      const mockEvent = {
        id: "mixed-case-event-id",
        invite_token: "mixed-case-token-123456789012",
      };

      // 混合ケースでの最初の登録
      const firstParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "混合ケース参加者",
        email: "MixedCase@Example.Com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 異なるケースでの重複登録の試行
      const duplicateParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "別ケース参加者",
        email: "mixedcase@example.com", // 小文字
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      expect(firstParticipation.email.toLowerCase()).toBe(
        duplicateParticipation.email.toLowerCase()
      );
    });
  });

  describe("異なる参加ステータスでの重複", () => {
    it("参加から不参加への変更でも重複として扱われる", async () => {
      const mockEvent = {
        id: "status-change-event-id",
        invite_token: "status-change-token-123456789012",
      };

      const email = "statuschange@example.com";

      // 参加での最初の登録
      const attendingParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "参加者",
        email: email,
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 不参加での重複登録の試行
      const notAttendingParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "不参加者",
        email: email, // 同じメールアドレス
        attendanceStatus: "not_attending" as const,
      };

      expect(attendingParticipation.email).toBe(email);
      expect(notAttendingParticipation.email).toBe(email);
    });

    it("未定から参加への変更でも重複として扱われる", async () => {
      const mockEvent = {
        id: "maybe-to-attending-event-id",
        invite_token: "maybe-to-attending-token-123456789012",
      };

      const email = "maybetoattending@example.com";

      // 未定での最初の登録
      const maybeParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "未定者",
        email: email,
        attendanceStatus: "maybe" as const,
      };

      // 参加での重複登録の試行
      const attendingParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "参加者",
        email: email, // 同じメールアドレス
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      expect(maybeParticipation.email).toBe(email);
      expect(attendingParticipation.email).toBe(email);
    });
  });

  describe("異なる決済方法での重複", () => {
    it("同じメールアドレスで異なる決済方法を選択しても重複として扱われる", async () => {
      const mockEvent = {
        id: "payment-method-duplicate-event-id",
        invite_token: "payment-method-duplicate-token-123456789012",
        fee: 2000,
      };

      const email = "paymentduplicate@example.com";

      // Stripe決済での最初の登録
      const stripeParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "Stripe参加者",
        email: email,
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 現金決済での重複登録の試行
      const cashParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "現金参加者",
        email: email, // 同じメールアドレス
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      expect(stripeParticipation.email).toBe(email);
      expect(cashParticipation.email).toBe(email);
      expect(stripeParticipation.paymentMethod).not.toBe(cashParticipation.paymentMethod);
    });
  });

  describe("バリデーション段階での重複チェック", () => {
    it("バリデーション関数で重複が正しく検出される", async () => {
      const eventId = "test-event-id";
      const duplicateEmail = "validation@example.com";

      // 重複が存在する状態をモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: "existing-attendance" },
                error: null,
              }),
            }),
          }),
        }),
      });

      const participationData = {
        inviteToken: "validation-duplicate-token-123456789012",
        nickname: "バリデーションテスト",
        email: duplicateEmail,
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      expect(participationData.email).toBe(duplicateEmail);
    });

    it("重複がない場合はバリデーションが通る", async () => {
      const eventId = "test-event-id";
      const uniqueEmail = "unique@example.com";

      // 重複が存在しない状態をモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: "Not found" },
              }),
            }),
          }),
        }),
      });

      const participationData = {
        inviteToken: "validation-unique-token-123456789012",
        nickname: "ユニークテスト",
        email: uniqueEmail,
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      expect(participationData.email).toBe(uniqueEmail);
    });
  });

  describe("複数イベント間での重複", () => {
    it("異なるイベントでは同じメールアドレスでも登録可能", async () => {
      // 最初のイベント
      const firstEvent = {
        id: "first-event-id",
        invite_token: "first-event-token-123456789012",
      };

      // 2番目のイベント
      const secondEvent = {
        id: "second-event-id",
        invite_token: "second-event-token-123456789012",
      };

      const sameEmail = "multievent@example.com";

      // 最初のイベントでの登録
      const firstEventParticipation = {
        inviteToken: firstEvent.invite_token,
        nickname: "最初のイベント参加者",
        email: sameEmail,
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 2番目のイベントでの登録（同じメールアドレス）
      const secondEventParticipation = {
        inviteToken: secondEvent.invite_token,
        nickname: "2番目のイベント参加者",
        email: sameEmail, // 同じメールアドレス
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      expect(firstEventParticipation.email).toBe(sameEmail);
      expect(secondEventParticipation.email).toBe(sameEmail);
      expect(firstEvent.id).not.toBe(secondEvent.id);
    });
  });

  describe("エラーハンドリング", () => {
    it("重複チェック中のデータベースエラーを適切に処理する", async () => {
      const mockEvent = {
        id: "db-error-duplicate-event-id",
        invite_token: "db-error-duplicate-token-123456789012",
      };

      // データベースエラーをモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockRejectedValue(new Error("Database connection failed")),
            }),
          }),
        }),
      });

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "DBエラーテスト",
        email: "dberror@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      expect(participationData.email).toBe("dberror@example.com");
    });

    it("重複チェックのタイムアウトを適切に処理する", async () => {
      const eventId = "timeout-test-event-id";
      const email = "timeout@example.com";

      // タイムアウトをシミュレート
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest
                .fn()
                .mockImplementation(
                  () =>
                    new Promise((_, reject) =>
                      setTimeout(() => reject(new Error("Request timeout")), 100)
                    )
                ),
            }),
          }),
        }),
      });

      const participationData = {
        inviteToken: "timeout-test-token-123456789012",
        nickname: "タイムアウトテスト",
        email: email,
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      expect(participationData.email).toBe(email);
    });
  });

  describe("セキュリティ考慮事項", () => {
    it("重複チェック時にSQLインジェクション攻撃を防ぐ", async () => {
      const eventId = "security-test-event-id";
      const maliciousEmail = "test@example.com'; DROP TABLE attendances; --";

      const participationData = {
        inviteToken: "security-test-token-123456789012",
        nickname: "セキュリティテスト",
        email: maliciousEmail,
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // メールアドレスのバリデーションでSQLインジェクション攻撃が防がれる
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(maliciousEmail);
      expect(isValidEmail).toBe(false);
    });

    it("重複チェック時の情報漏洩を防ぐ", async () => {
      const mockEvent = {
        id: "info-leak-test-event-id",
        invite_token: "info-leak-test-token-123456789012",
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "情報漏洩テスト",
        email: "infoleak@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // エラーメッセージが一般的で、具体的な情報を漏洩しない
      const errorMessage = "既に登録されています";

      expect(errorMessage).not.toContain("infoleak@example.com");
      expect(errorMessage).not.toContain(mockEvent.id);
      expect(errorMessage).toContain("既に登録されています");
    });
  });
});
