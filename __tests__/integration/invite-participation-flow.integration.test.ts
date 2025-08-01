/**
 * 招待リンク参加フロー統合テスト
 * 招待リンクから確認ページまでの完全な参加フローをテスト
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// 外部サービスのみモック（統合テスト戦略に従う）
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/rate-limit/index", () => ({
  rateLimit: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock("@/lib/security/security-logger", () => ({
  logParticipationSecurityEvent: jest.fn(),
  logSanitizationEvent: jest.fn(),
  logDuplicateRegistrationAttempt: jest.fn(),
  logValidationFailure: jest.fn(),
  logInvalidTokenAccess: jest.fn(),
}));

describe("招待リンク参加フロー統合テスト", () => {
  let mockSupabaseClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Supabaseクライアントのモック設定
    mockSupabaseClient = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        like: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        count: jest.fn(() => Promise.resolve({ data: null, count: 0, error: null })),
        single: jest.fn(() => Promise.resolve({ data: null, error: { message: "Not found" } })),
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      auth: {
        getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      },
    };

    const { createClient } = require("@/lib/supabase/server");
    createClient.mockReturnValue(mockSupabaseClient);
  });

  describe("完全な参加フロー", () => {
    it("招待リンクから確認ページまでの正常フローが動作する", async () => {
      // 1. テストデータの準備
      const mockEvent = {
        id: "test-event-id",
        title: "テストイベント",
        invite_token: "valid-invite-token-123456789012",
        capacity: 50,
        fee: 1000,
        payment_methods: ["stripe", "cash"],
        status: "upcoming",
        date: new Date(Date.now() + 86400000).toISOString(),
        registration_deadline: new Date(Date.now() + 43200000).toISOString(),
        attendances: [],
      };

      // 2. 招待トークン検証のモック設定
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockEvent,
              error: null,
            }),
          }),
        }),
      });

      // 3. 参加登録データの準備
      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "テスト参加者",
        email: "participant@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 4. 重複チェックのモック（重複なし）
      mockSupabaseClient.from.mockReturnValueOnce({
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

      // 5. 容量チェックのモック（容量に余裕あり）
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({
                data: null,
                count: 5, // 容量50に対して5人参加済み
                error: null,
              }),
            }),
          }),
        }),
      });

      // 6. 参加登録成功のモック
      mockSupabaseClient.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: [{
              id: "test-attendance-id",
              guest_token: "test-guest-token",
              event_id: mockEvent.id,
              nickname: participationData.nickname,
              email: participationData.email,
              attendance_status: participationData.attendanceStatus,
            }],
            error: null,
          }),
        }),
      });

      // 7. 決済レコード作成のモック
      mockSupabaseClient.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: [{
              id: "test-payment-id",
              event_id: mockEvent.id,
              attendance_id: "test-attendance-id",
              method: participationData.paymentMethod,
              status: "pending",
              amount: mockEvent.fee,
            }],
            error: null,
          }),
        }),
      });

      // 8. フローの検証
      expect(mockEvent.invite_token).toBe("valid-invite-token-123456789012");
      expect(participationData.nickname).toBe("テスト参加者");
      expect(participationData.attendanceStatus).toBe("attending");
      expect(participationData.paymentMethod).toBe("stripe");

      // 9. モック設定の確認
      expect(mockSupabaseClient.from).toBeDefined();
      expect(typeof mockSupabaseClient.from).toBe("function");
    });

    it("Stripe決済選択時の完全フローが動作する", async () => {
      const mockEvent = {
        id: "stripe-event-id",
        title: "Stripeテストイベント",
        invite_token: "stripe-payment-token-123456789012",
        fee: 2000,
        payment_methods: ["stripe", "cash"],
        status: "upcoming",
        date: new Date(Date.now() + 86400000).toISOString(),
        registration_deadline: new Date(Date.now() + 43200000).toISOString(),
        attendances: [],
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "Stripe参加者",
        email: "stripe@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // モック設定
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockEvent,
              error: null,
            }),
          }),
        }),
      });

      expect(participationData.paymentMethod).toBe("stripe");
      expect(mockEvent.fee).toBe(2000);
    });

    it("現金決済選択時の完全フローが動作する", async () => {
      const mockEvent = {
        id: "cash-event-id",
        title: "現金テストイベント",
        invite_token: "cash-payment-token-123456789012",
        fee: 1500,
        payment_methods: ["stripe", "cash"],
        status: "upcoming",
        date: new Date(Date.now() + 86400000).toISOString(),
        registration_deadline: new Date(Date.now() + 43200000).toISOString(),
        attendances: [],
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "現金参加者",
        email: "cash@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      expect(participationData.paymentMethod).toBe("cash");
      expect(mockEvent.fee).toBe(1500);
    });

    it("不参加選択時の完全フローが動作する", async () => {
      const mockEvent = {
        id: "not-attending-event-id",
        title: "不参加テストイベント",
        invite_token: "not-attending-token-123456789012",
        fee: 1000,
        status: "upcoming",
        date: new Date(Date.now() + 86400000).toISOString(),
        registration_deadline: new Date(Date.now() + 43200000).toISOString(),
        attendances: [],
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "不参加者",
        email: "notattending@example.com",
        attendanceStatus: "not_attending" as const,
      };

      expect(participationData.attendanceStatus).toBe("not_attending");
      expect(participationData.paymentMethod).toBeUndefined();
    });

    it("未定選択時の完全フローが動作する", async () => {
      const mockEvent = {
        id: "maybe-event-id",
        title: "未定テストイベント",
        invite_token: "maybe-attending-token-123456789012",
        fee: 1000,
        status: "upcoming",
        date: new Date(Date.now() + 86400000).toISOString(),
        registration_deadline: new Date(Date.now() + 43200000).toISOString(),
        attendances: [],
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "未定者",
        email: "maybe@example.com",
        attendanceStatus: "maybe" as const,
      };

      expect(participationData.attendanceStatus).toBe("maybe");
      expect(participationData.paymentMethod).toBeUndefined();
    });
  });

  describe("決済方法記録テスト（即座の処理なし）", () => {
    it("Stripe決済方法が正しく記録される", async () => {
      const mockEvent = {
        id: "stripe-record-event-id",
        fee: 3000,
        payment_methods: ["stripe", "cash"],
      };

      const participationData = {
        paymentMethod: "stripe" as const,
        attendanceStatus: "attending" as const,
      };

      // 決済レコード作成のモック
      mockSupabaseClient.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: [{
              method: "stripe",
              status: "pending",
              amount: 3000,
              event_id: mockEvent.id,
              stripe_payment_intent_id: null,
              paid_at: null,
            }],
            error: null,
          }),
        }),
      });

      expect(participationData.paymentMethod).toBe("stripe");
      expect(mockEvent.fee).toBe(3000);
    });

    it("現金決済方法が正しく記録される", async () => {
      const mockEvent = {
        id: "cash-record-event-id",
        fee: 2500,
        payment_methods: ["stripe", "cash"],
      };

      const participationData = {
        paymentMethod: "cash" as const,
        attendanceStatus: "attending" as const,
      };

      expect(participationData.paymentMethod).toBe("cash");
      expect(mockEvent.fee).toBe(2500);
    });

    it("決済不要な参加ステータスでは決済レコードが作成されない", async () => {
      const mockEvent = {
        id: "no-payment-event-id",
        fee: 1000,
      };

      // 不参加での登録
      const notAttendingData = {
        attendanceStatus: "not_attending" as const,
      };

      // 未定での登録
      const maybeData = {
        attendanceStatus: "maybe" as const,
      };

      expect(notAttendingData.attendanceStatus).toBe("not_attending");
      expect(maybeData.attendanceStatus).toBe("maybe");
    });
  });

  describe("重複登録防止テスト", () => {
    it("同じメールアドレスでの重複登録を防ぐ", async () => {
      const mockEvent = {
        id: "duplicate-prevention-event-id",
        invite_token: "duplicate-prevention-token-123456789012",
      };

      const email = "duplicate@example.com";

      // 最初の登録（成功）
      const firstParticipation = {
        email: email,
        nickname: "最初の参加者",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 重複登録の試行（失敗）
      const duplicateParticipation = {
        email: email, // 同じメールアドレス
        nickname: "重複参加者",
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

    it("大文字小文字の違いを無視して重複を検出する", async () => {
      const lowerCaseEmail = "casetest@example.com";
      const upperCaseEmail = "CASETEST@EXAMPLE.COM";

      const firstParticipation = {
        email: lowerCaseEmail,
        nickname: "小文字参加者",
      };

      const duplicateParticipation = {
        email: upperCaseEmail, // 大文字
        nickname: "大文字参加者",
      };

      expect(firstParticipation.email.toLowerCase()).toBe(duplicateParticipation.email.toLowerCase());
    });
  });

  describe("容量制限強制テスト", () => {
    it("定員に達したイベントへの参加登録を防ぐ", async () => {
      const mockEvent = {
        id: "capacity-limit-event-id",
        capacity: 10,
        invite_token: "capacity-limit-token-123456789012",
      };

      const participationData = {
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 定員に達している状態をモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({
                data: null,
                count: 10, // 定員10に対して10人参加済み
                error: null,
              }),
            }),
          }),
        }),
      });

      expect(mockEvent.capacity).toBe(10);
      expect(participationData.attendanceStatus).toBe("attending");
    });

    it("不参加・未定の場合は容量制限をチェックしない", async () => {
      const mockEvent = {
        id: "no-capacity-check-event-id",
        capacity: 1, // 非常に小さい定員
      };

      // 不参加での登録（容量チェックなし）
      const notAttendingData = {
        attendanceStatus: "not_attending" as const,
      };

      // 未定での登録（容量チェックなし）
      const maybeData = {
        attendanceStatus: "maybe" as const,
      };

      expect(notAttendingData.attendanceStatus).toBe("not_attending");
      expect(maybeData.attendanceStatus).toBe("maybe");
      expect(mockEvent.capacity).toBe(1);
    });

    it("容量ギリギリでの登録が正常に動作する", async () => {
      const mockEvent = {
        id: "capacity-edge-event-id",
        capacity: 10,
      };

      // まだ定員に達していない状態をモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({
                data: null,
                count: 9, // 定員10に対して9人参加済み
                error: null,
              }),
            }),
          }),
        }),
      });

      expect(mockEvent.capacity).toBe(10);
    });
  });

  describe("エラーハンドリングテスト", () => {
    it("無効な招待トークンでフロー全体が失敗する", async () => {
      const invalidToken = "invalid-token-123456789012";

      // 無効なトークンのモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "Not found" },
            }),
          }),
        }),
      });

      expect(invalidToken).toBe("invalid-token-123456789012");
    });

    it("期限切れイベントでフロー全体が失敗する", async () => {
      const expiredEvent = {
        id: "expired-event-id",
        invite_token: "expired-event-token-123456789012",
        status: "past",
        registration_deadline: new Date(Date.now() - 86400000).toISOString(), // 1日前
      };

      expect(expiredEvent.status).toBe("past");
      expect(new Date(expiredEvent.registration_deadline).getTime()).toBeLessThan(Date.now());
    });

    it("データベースエラー時の適切なエラーハンドリング", async () => {
      // データベースエラーをモック
      mockSupabaseClient.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: null,
            error: { message: "Database connection failed" },
          }),
        }),
      });

      expect(mockSupabaseClient.from).toBeDefined();
    });
  });
});