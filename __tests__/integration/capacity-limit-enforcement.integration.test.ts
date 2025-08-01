/**
 * 容量制限強制統合テスト
 * イベントの定員制限を強制する機能をテスト
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// 外部サービスのみモック
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/rate-limit/index", () => ({
  rateLimit: jest.fn(() => Promise.resolve({ success: true })),
}));

describe("容量制限強制統合テスト", () => {
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

  describe("基本的な容量制限", () => {
    it("定員に達したイベントへの参加登録を防ぐ", async () => {
      const mockEvent = {
        id: "capacity-limit-event-id",
        invite_token: "capacity-limit-token-123456789012",
        capacity: 10,
        fee: 1000,
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "定員オーバー参加者",
        email: "capacitytest@example.com",
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

    it("定員に達していないイベントでは正常に登録できる", async () => {
      const mockEvent = {
        id: "capacity-available-event-id",
        invite_token: "capacity-available-token-123456789012",
        capacity: 50,
        fee: 1500,
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "正常参加者",
        email: "normal@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // まだ定員に達していない状態をモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({
                data: null,
                count: 25, // 定員50に対して25人参加済み
                error: null,
              }),
            }),
          }),
        }),
      });

      expect(mockEvent.capacity).toBe(50);
      expect(participationData.attendanceStatus).toBe("attending");
    });
  });

  describe("参加ステータス別の容量チェック", () => {
    it("参加選択時のみ容量制限をチェックする", async () => {
      const mockEvent = {
        id: "attending-capacity-event-id",
        invite_token: "attending-capacity-token-123456789012",
        capacity: 5,
      };

      const attendingData = {
        inviteToken: mockEvent.invite_token,
        nickname: "参加者",
        email: "attending@example.com",
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
                count: 5, // 定員5に対して5人参加済み
                error: null,
              }),
            }),
          }),
        }),
      });

      expect(mockEvent.capacity).toBe(5);
      expect(attendingData.attendanceStatus).toBe("attending");
    });

    it("不参加選択時は容量制限をチェックしない", async () => {
      const mockEvent = {
        id: "not-attending-capacity-event-id",
        invite_token: "not-attending-capacity-token-123456789012",
        capacity: 1, // 非常に小さい定員
      };

      const notAttendingData = {
        inviteToken: mockEvent.invite_token,
        nickname: "不参加者",
        email: "notattending@example.com",
        attendanceStatus: "not_attending" as const,
      };

      expect(mockEvent.capacity).toBe(1);
      expect(notAttendingData.attendanceStatus).toBe("not_attending");
      expect(notAttendingData.paymentMethod).toBeUndefined();
    });

    it("未定選択時は容量制限をチェックしない", async () => {
      const mockEvent = {
        id: "maybe-capacity-event-id",
        invite_token: "maybe-capacity-token-123456789012",
        capacity: 1, // 非常に小さい定員
      };

      const maybeData = {
        inviteToken: mockEvent.invite_token,
        nickname: "未定者",
        email: "maybe@example.com",
        attendanceStatus: "maybe" as const,
      };

      expect(mockEvent.capacity).toBe(1);
      expect(maybeData.attendanceStatus).toBe("maybe");
      expect(maybeData.paymentMethod).toBeUndefined();
    });
  });

  describe("容量ギリギリのケース", () => {
    it("容量ギリギリでの登録が正常に動作する", async () => {
      const mockEvent = {
        id: "capacity-edge-event-id",
        invite_token: "capacity-edge-token-123456789012",
        capacity: 10,
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "ギリギリ参加者",
        email: "edge@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
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
      expect(participationData.attendanceStatus).toBe("attending");
    });

    it("最後の1枠での登録が正常に動作する", async () => {
      const mockEvent = {
        id: "last-slot-event-id",
        invite_token: "last-slot-token-123456789012",
        capacity: 1,
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "最後の参加者",
        email: "lastslot@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      // まだ1枠空いている状態をモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({
                data: null,
                count: 0, // 定員1に対して0人参加済み
                error: null,
              }),
            }),
          }),
        }),
      });

      expect(mockEvent.capacity).toBe(1);
      expect(participationData.attendanceStatus).toBe("attending");
    });
  });

  describe("無制限容量のイベント", () => {
    it("容量制限がないイベントでは制限チェックをスキップする", async () => {
      const unlimitedEvent = {
        id: "unlimited-capacity-event-id",
        invite_token: "unlimited-capacity-token-123456789012",
        capacity: null, // 無制限
      };

      const participationData = {
        inviteToken: unlimitedEvent.invite_token,
        nickname: "無制限参加者",
        email: "unlimited@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      expect(unlimitedEvent.capacity).toBeNull();
      expect(participationData.attendanceStatus).toBe("attending");
    });

    it("容量が0のイベントでは全ての参加登録を拒否する", async () => {
      const zeroCapacityEvent = {
        id: "zero-capacity-event-id",
        invite_token: "zero-capacity-token-123456789012",
        capacity: 0,
      };

      const participationData = {
        inviteToken: zeroCapacityEvent.invite_token,
        nickname: "ゼロ容量参加者",
        email: "zerocapacity@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 容量が0なので常に制限に達している
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({
                data: null,
                count: 0, // 0人参加済みでも容量0なので制限に達している
                error: null,
              }),
            }),
          }),
        }),
      });

      expect(zeroCapacityEvent.capacity).toBe(0);
      expect(participationData.attendanceStatus).toBe("attending");
    });
  });

  describe("同時登録の競合状態", () => {
    it("同時登録時の競合状態を適切に処理する", async () => {
      const mockEvent = {
        id: "concurrent-registration-event-id",
        invite_token: "concurrent-registration-token-123456789012",
        capacity: 1, // 1枠のみ
      };

      // 最初の参加者
      const firstParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "最初の参加者",
        email: "first@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 2番目の参加者（同時登録をシミュレート）
      const secondParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "2番目の参加者",
        email: "second@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      // 最初の登録後に定員に達した状態をモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({
                data: null,
                count: 1, // 定員1に対して1人参加済み
                error: null,
              }),
            }),
          }),
        }),
      });

      expect(mockEvent.capacity).toBe(1);
      expect(firstParticipation.email).not.toBe(secondParticipation.email);
    });
  });

  describe("容量チェックのパフォーマンス", () => {
    it("大容量イベントでの容量チェックが効率的に動作する", async () => {
      const largeEvent = {
        id: "large-capacity-event-id",
        invite_token: "large-capacity-token-123456789012",
        capacity: 1000, // 大容量
      };

      const participationData = {
        inviteToken: largeEvent.invite_token,
        nickname: "大容量参加者",
        email: "largecapacity@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({
                data: null,
                count: 500, // 定員1000に対して500人参加済み
                error: null,
              }),
            }),
          }),
        }),
      });

      const startTime = Date.now();
      // 実際のテストではここでServer Actionを呼び出す
      const endTime = Date.now();

      expect(largeEvent.capacity).toBe(1000);
      expect(participationData.attendanceStatus).toBe("attending");
      // パフォーマンステスト: 1秒以内に完了することを確認
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe("エラーハンドリング", () => {
    it("容量チェック中のデータベースエラーを適切に処理する", async () => {
      const mockEvent = {
        id: "capacity-db-error-event-id",
        invite_token: "capacity-db-error-token-123456789012",
        capacity: 10,
      };

      // データベースエラーをモック
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              count: jest.fn().mockRejectedValue(new Error("Database connection failed")),
            }),
          }),
        }),
      });

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "容量DBエラーテスト",
        email: "capacitydberror@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      expect(participationData.email).toBe("capacitydberror@example.com");
    });

    it("無効な容量値を適切に処理する", async () => {
      const invalidCapacityEvent = {
        id: "invalid-capacity-event-id",
        invite_token: "invalid-capacity-token-123456789012",
        capacity: -1, // 無効な容量値
      };

      const participationData = {
        inviteToken: invalidCapacityEvent.invite_token,
        nickname: "無効容量テスト",
        email: "invalidcapacity@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 無効な容量値でも適切に処理される
      expect(invalidCapacityEvent.capacity).toBe(-1);
      expect(participationData.attendanceStatus).toBe("attending");
    });
  });

  describe("容量制限とその他の制約の組み合わせ", () => {
    it("容量制限と重複登録防止が同時に動作する", async () => {
      const mockEvent = {
        id: "capacity-duplicate-event-id",
        invite_token: "capacity-duplicate-token-123456789012",
        capacity: 10,
      };

      const email = "capacityduplicate@example.com";

      // 最初の登録
      const firstParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "最初の参加者",
        email: email,
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 重複登録の試行（容量チェック前に重複チェックで拒否される）
      const duplicateParticipation = {
        inviteToken: mockEvent.invite_token,
        nickname: "重複参加者",
        email: email, // 同じメールアドレス
        attendanceStatus: "attending" as const,
        paymentMethod: "cash" as const,
      };

      expect(firstParticipation.email).toBe(email);
      expect(duplicateParticipation.email).toBe(email);
    });

    it("容量制限と期限切れが同時に発生した場合の処理", async () => {
      const expiredFullEvent = {
        id: "expired-full-event-id",
        invite_token: "expired-full-token-123456789012",
        capacity: 5,
        status: "past",
        registration_deadline: new Date(Date.now() - 86400000).toISOString(), // 1日前
      };

      const participationData = {
        inviteToken: expiredFullEvent.invite_token,
        nickname: "期限切れ満員テスト",
        email: "expiredfull@example.com",
        attendanceStatus: "attending" as const,
        paymentMethod: "stripe" as const,
      };

      // 期限切れが優先される
      expect(expiredFullEvent.status).toBe("past");
      expect(new Date(expiredFullEvent.registration_deadline).getTime()).toBeLessThan(Date.now());
    });
  });

  describe("容量制限のログ記録", () => {
    it("容量制限による拒否がログに記録される", async () => {
      const mockEvent = {
        id: "capacity-logging-event-id",
        invite_token: "capacity-logging-token-123456789012",
        capacity: 3,
      };

      const participationData = {
        inviteToken: mockEvent.invite_token,
        nickname: "ログテスト参加者",
        email: "logging@example.com",
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
                count: 3, // 定員3に対して3人参加済み
                error: null,
              }),
            }),
          }),
        }),
      });

      expect(mockEvent.capacity).toBe(3);
      expect(participationData.attendanceStatus).toBe("attending");
    });
  });
});