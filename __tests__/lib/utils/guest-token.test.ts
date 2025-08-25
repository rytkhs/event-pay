import { validateGuestToken, generateGuestToken } from "@/lib/utils/guest-token";
import { createClient } from "@/lib/supabase/server";

// モック
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

const mockSupabase = {
  from: jest.fn(),
};

const mockAttendanceData = {
  id: "attendance-123",
  nickname: "テストユーザー",
  email: "test@example.com",
  status: "attending",
  guest_token: "testguesttoken123456789012345678",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  event: {
    id: "event-123",
    title: "テストイベント",
    description: "テストイベントの説明",
    date: "2024-12-31T15:00:00Z",
    location: "テスト会場",
    fee: 1000,
    capacity: 50,
    registration_deadline: "2024-12-30T15:00:00Z",
    payment_deadline: "2024-12-30T15:00:00Z",
    created_by: "organizer-123",
  },
  payment: {
    id: "payment-123",
    amount: 1000,
    method: "stripe",
    status: "pending",
    created_at: "2024-01-01T00:00:00Z",
  },
};

describe("validateGuestToken", () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    jest.clearAllMocks();
  });

  describe("トークンの基本検証", () => {
    it("空のトークンは無効", async () => {
      const result = await validateGuestToken("");

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("無効なゲストトークンです");
      expect(result.canModify).toBe(false);
    });

    it("nullのトークンは無効", async () => {
      const result = await validateGuestToken(null as any);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("無効なゲストトークンです");
      expect(result.canModify).toBe(false);
    });

    it("36文字でないトークンまたはプレフィックスなしは無効", async () => {
      const result = await validateGuestToken("short-token");

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("無効なゲストトークンの形式です");
      expect(result.canModify).toBe(false);
    });

    it("無効な文字を含むトークンは無効", async () => {
      const result = await validateGuestToken("gst_invalid@token#with$special%");

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("無効なゲストトークンの形式です");
      expect(result.canModify).toBe(false);
    });
  });

  describe("データベース検索", () => {
    it("有効なトークンで参加データが取得される", async () => {
      // 現在時刻を2024-12-29 12:00:00 JST（UTC: 2024-12-29 03:00:00）に固定
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-12-29T03:00:00Z"));

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockAttendanceData,
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await validateGuestToken("testguesttoken123456789012345678");

      expect(result.isValid).toBe(true);
      expect(result.attendance).toBeDefined();
      expect(result.attendance?.id).toBe("attendance-123");
      expect(result.canModify).toBe(true);

      expect(mockSupabase.from).toHaveBeenCalledWith("attendances");
      expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining("event:events"));

      jest.useRealTimers();
    });

    it("存在しないトークンは無効", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: "Not found" },
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await validateGuestToken("nonexistenttoken1234567890123456");

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("参加データが見つかりません");
      expect(result.canModify).toBe(false);
    });

    it("イベントデータがない場合は無効", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              ...mockAttendanceData,
              event: null,
            },
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await validateGuestToken("testguesttoken123456789012345678");

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("イベントデータが見つかりません");
      expect(result.canModify).toBe(false);
    });
  });

  describe("変更可能性の判定", () => {
    beforeEach(() => {
      // 現在時刻を2024-12-29 12:00:00 JST（UTC: 2024-12-29 03:00:00）に固定
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-12-29T03:00:00Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("登録締切前は変更可能", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockAttendanceData,
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await validateGuestToken("testguesttoken123456789012345678");

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(true);
    });

    it("登録締切後は変更不可", async () => {
      // 登録締切を過去に設定
      const pastDeadlineData = {
        ...mockAttendanceData,
        event: {
          ...mockAttendanceData.event,
          registration_deadline: "2024-12-28T15:00:00Z", // 昨日
        },
      };

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: pastDeadlineData,
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await validateGuestToken("testguesttoken123456789012345678");

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(false);
    });

    it("イベント開始後は変更不可", async () => {
      // イベント日時を過去に設定
      const pastEventData = {
        ...mockAttendanceData,
        event: {
          ...mockAttendanceData.event,
          date: "2024-12-28T15:00:00Z", // 昨日
          registration_deadline: null, // 登録締切なし
        },
      };

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: pastEventData,
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await validateGuestToken("testguesttoken123456789012345678");

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(false);
    });

    it("登録締切がない場合はイベント開始時刻で判定", async () => {
      const noDeadlineData = {
        ...mockAttendanceData,
        event: {
          ...mockAttendanceData.event,
          registration_deadline: null,
        },
      };

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: noDeadlineData,
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await validateGuestToken("testguesttoken123456789012345678");

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(true); // イベント開始前なので変更可能
    });
  });

  describe("エラーハンドリング", () => {
    it("データベースエラー時は適切なエラーメッセージを返す", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockRejectedValue(new Error("Database error")),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await validateGuestToken("testguesttoken123456789012345678");

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("参加データの取得中にエラーが発生しました");
      expect(result.canModify).toBe(false);
    });
  });
});

describe("generateGuestToken", () => {
  it("36文字のgst_プレフィックス付きトークンが生成される", () => {
    const token = generateGuestToken();
    expect(token).toHaveLength(36);
    expect(token).toMatch(/^gst_[a-zA-Z0-9_-]{32}$/);
  });

  it("URL安全な文字のみが使用される", () => {
    const token = generateGuestToken();
    expect(token).toMatch(/^gst_[a-zA-Z0-9_-]{32}$/);
  });

  it("毎回異なるトークンが生成される", () => {
    const token1 = generateGuestToken();
    const token2 = generateGuestToken();
    expect(token1).not.toBe(token2);
  });
});
