/**
 * 招待トークン検証機能の単体テスト
 * @jest-environment node
 */

import {
  validateInviteToken,
  validateInviteTokenFormat,
  checkEventCapacity,
  checkDuplicateEmail,
  type EventDetail,
  type InviteValidationResult,
} from "@/lib/utils/invite-token";
import { createClient } from "@/lib/supabase/server";

// Supabaseクライアントをモック
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe("Invite Token Validation", () => {
  const mockSupabase = {
    from: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
  });

  describe("validateInviteTokenFormat", () => {
    it("有効な32文字のトークンを受け入れる", () => {
      const validToken = "abcdefghijklmnopqrstuvwxyz123456";
      expect(validateInviteTokenFormat(validToken)).toBe(true);
    });

    it("アンダースコアとハイフンを含むトークンを受け入れる", () => {
      const validToken = "abcdefgh_ijklmno-pqrstuvwxyz1234";
      expect(validateInviteTokenFormat(validToken)).toBe(true);
    });

    it("短すぎるトークンを拒否する", () => {
      const shortToken = "short";
      expect(validateInviteTokenFormat(shortToken)).toBe(false);
    });

    it("長すぎるトークンを拒否する", () => {
      const longToken = "a".repeat(33);
      expect(validateInviteTokenFormat(longToken)).toBe(false);
    });

    it("無効な文字を含むトークンを拒否する", () => {
      const invalidToken = "abcdefghijklmnopqrstuvwxyz123@#$";
      expect(validateInviteTokenFormat(invalidToken)).toBe(false);
    });

    it("空文字列を拒否する", () => {
      expect(validateInviteTokenFormat("")).toBe(false);
    });

    it("nullやundefinedを拒否する", () => {
      expect(validateInviteTokenFormat(null as any)).toBe(false);
      expect(validateInviteTokenFormat(undefined as any)).toBe(false);
    });
  });

  describe("validateInviteToken", () => {
    const mockEventData = {
      id: "event-123",
      title: "テストイベント",
      date: "2024-12-31T18:00:00Z",
      location: "テスト会場",
      description: "テストイベントの説明",
      fee: 1000,
      capacity: 50,
      payment_methods: ["stripe", "cash"],
      registration_deadline: "2024-12-30T23:59:59Z",
      payment_deadline: "2024-12-31T17:00:00Z",
      status: "upcoming",
      invite_token: "abcdefghijklmnopqrstuvwxyz123456",
      attendances: [{ id: "att1" }, { id: "att2" }],
    };

    beforeEach(() => {
      // デフォルトのモック設定
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockEventData,
              error: null,
            }),
          }),
        }),
      });
    });

    it("有効なトークンで正常なイベントデータを返す", async () => {
      const result = await validateInviteToken("abcdefghijklmnopqrstuvwxyz123456");

      expect(result.isValid).toBe(true);
      expect(result.canRegister).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.id).toBe("event-123");
      expect(result.event?.attendances_count).toBe(2);
      expect(result.errorMessage).toBeUndefined();
    });

    it("無効なフォーマットのトークンを拒否する", async () => {
      const result = await validateInviteToken("invalid-token");

      expect(result.isValid).toBe(false);
      expect(result.canRegister).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.errorMessage).toBe("無効な招待リンクです");
    });

    it("存在しないトークンを拒否する", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "No rows returned" },
            }),
          }),
        }),
      });

      const result = await validateInviteToken("nonexistenttoken123456789012345678");

      expect(result.isValid).toBe(false);
      expect(result.canRegister).toBe(false);
      expect(result.errorMessage).toBe("招待リンクが見つかりません");
    });

    it("キャンセルされたイベントの場合は登録不可", async () => {
      const cancelledEvent = { ...mockEventData, status: "cancelled" };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: cancelledEvent,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteToken("abcdefghijklmnopqrstuvwxyz123456");

      expect(result.isValid).toBe(true);
      expect(result.canRegister).toBe(false);
      expect(result.errorMessage).toBe("このイベントはキャンセルされました");
    });

    it("終了したイベントの場合は登録不可", async () => {
      const pastEvent = { ...mockEventData, status: "past" };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: pastEvent,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteToken("abcdefghijklmnopqrstuvwxyz123456");

      expect(result.isValid).toBe(true);
      expect(result.canRegister).toBe(false);
      expect(result.errorMessage).toBe("このイベントは終了しています");
    });

    it("申込期限が過ぎた場合は登録不可", async () => {
      // 過去の日付を設定
      const expiredEvent = {
        ...mockEventData,
        registration_deadline: "2020-01-01T00:00:00Z",
      };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: expiredEvent,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteToken("abcdefghijklmnopqrstuvwxyz123456");

      expect(result.isValid).toBe(true);
      expect(result.canRegister).toBe(false);
      expect(result.errorMessage).toBe("参加申込期限が過ぎています");
    });

    it("申込期限が未来の場合は登録可能", async () => {
      // 未来の日付を設定
      const futureEvent = {
        ...mockEventData,
        registration_deadline: "2030-12-31T23:59:59Z",
      };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: futureEvent,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteToken("abcdefghijklmnopqrstuvwxyz123456");

      expect(result.isValid).toBe(true);
      expect(result.canRegister).toBe(true);
      expect(result.errorMessage).toBeUndefined();
    });

    it("申込期限がnullの場合は登録可能", async () => {
      const noDeadlineEvent = {
        ...mockEventData,
        registration_deadline: null,
      };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: noDeadlineEvent,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteToken("abcdefghijklmnopqrstuvwxyz123456");

      expect(result.isValid).toBe(true);
      expect(result.canRegister).toBe(true);
      expect(result.errorMessage).toBeUndefined();
    });

    it("データベースエラーの場合は適切なエラーメッセージを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue(new Error("Database connection failed")),
          }),
        }),
      });

      const result = await validateInviteToken("abcdefghijklmnopqrstuvwxyz123456");

      expect(result.isValid).toBe(false);
      expect(result.canRegister).toBe(false);
      expect(result.errorMessage).toBe("招待リンクの検証中にエラーが発生しました");
    });

    it("参加者数が正しくカウントされる", async () => {
      const eventWithManyAttendances = {
        ...mockEventData,
        attendances: [
          { id: "att1" },
          { id: "att2" },
          { id: "att3" },
          { id: "att4" },
          { id: "att5" },
        ],
      };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: eventWithManyAttendances,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteToken("abcdefghijklmnopqrstuvwxyz123456");

      expect(result.event?.attendances_count).toBe(5);
    });

    it("参加者がいない場合は0をカウントする", async () => {
      const eventWithNoAttendances = {
        ...mockEventData,
        attendances: [],
      };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: eventWithNoAttendances,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteToken("abcdefghijklmnopqrstuvwxyz123456");

      expect(result.event?.attendances_count).toBe(0);
    });
  });

  describe("checkEventCapacity", () => {
    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: 5,
              error: null,
            }),
          }),
        }),
      });
    });

    it("定員制限がない場合はfalseを返す", async () => {
      const result = await checkEventCapacity("event-123", null);
      expect(result).toBe(false);
    });

    it("参加者数が定員未満の場合はfalseを返す", async () => {
      const result = await checkEventCapacity("event-123", 10);
      expect(result).toBe(false);
    });

    it("参加者数が定員に達した場合はtrueを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: 10,
              error: null,
            }),
          }),
        }),
      });

      const result = await checkEventCapacity("event-123", 10);
      expect(result).toBe(true);
    });

    it("参加者数が定員を超えた場合はtrueを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: 15,
              error: null,
            }),
          }),
        }),
      });

      const result = await checkEventCapacity("event-123", 10);
      expect(result).toBe(true);
    });

    it("データベースエラーの場合は安全のためtrueを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: null,
              error: { message: "Database error" },
            }),
          }),
        }),
      });

      const result = await checkEventCapacity("event-123", 10);
      expect(result).toBe(true);
    });

    it("予期しないエラーの場合は安全のためtrueを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockRejectedValue(new Error("Unexpected error")),
          }),
        }),
      });

      const result = await checkEventCapacity("event-123", 10);
      expect(result).toBe(true);
    });
  });

  describe("checkDuplicateEmail", () => {
    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      });
    });

    it("重複がない場合はfalseを返す", async () => {
      const result = await checkDuplicateEmail("event-123", "test@example.com");
      expect(result).toBe(false);
    });

    it("重複がある場合はtrueを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [{ id: "attendance-123" }],
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await checkDuplicateEmail("event-123", "test@example.com");
      expect(result).toBe(true);
    });

    it("データベースエラーの場合は安全のためtrueを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: null,
                error: { message: "Database error" },
              }),
            }),
          }),
        }),
      });

      const result = await checkDuplicateEmail("event-123", "test@example.com");
      expect(result).toBe(true);
    });

    it("予期しないエラーの場合は安全のためtrueを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockRejectedValue(new Error("Unexpected error")),
            }),
          }),
        }),
      });

      const result = await checkDuplicateEmail("event-123", "test@example.com");
      expect(result).toBe(true);
    });

    it("正しいパラメータでクエリが実行される", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      });
      const mockEq1 = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });
      const mockEq2 = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });
      const mockLimit = jest.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      mockSelect.mockReturnValue({
        eq: mockEq1,
      });
      mockEq1.mockReturnValue({
        eq: mockEq2,
      });
      mockEq2.mockReturnValue({
        limit: mockLimit,
      });

      await checkDuplicateEmail("event-123", "test@example.com");

      expect(mockSupabase.from).toHaveBeenCalledWith("attendances");
      expect(mockSelect).toHaveBeenCalledWith("id");
      expect(mockEq1).toHaveBeenCalledWith("event_id", "event-123");
      expect(mockEq2).toHaveBeenCalledWith("email", "test@example.com");
      expect(mockLimit).toHaveBeenCalledWith(1);
    });
  });
});
