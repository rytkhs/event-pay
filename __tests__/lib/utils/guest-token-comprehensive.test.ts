/**
 * ゲストトークン生成・検証の包括的な単体テスト
 * @jest-environment jsdom
 */

import {
  generateGuestToken,
  validateGuestToken,
  type GuestTokenValidationResult,
} from "@/lib/utils/guest-token";
import { createClient } from "@/lib/supabase/server";

// Supabaseクライアントをモック
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe("Guest Token Comprehensive Tests", () => {
  const mockSupabase = {
    from: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
  });

  describe("generateGuestToken", () => {
    it("32文字のトークンを生成する", () => {
      const token = generateGuestToken();
      expect(token).toHaveLength(32);
    });

    it("URL安全な文字のみを使用する", () => {
      const token = generateGuestToken();
      expect(token).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it("パディング文字（=）を含まない", () => {
      const token = generateGuestToken();
      expect(token).not.toContain("=");
    });

    it("毎回異なるトークンを生成する", () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateGuestToken());
      }
      expect(tokens.size).toBe(100);
    });

    it("十分なエントロピーを持つ", () => {
      const tokens = [];
      for (let i = 0; i < 1000; i++) {
        tokens.push(generateGuestToken());
      }

      // 文字の分布をチェック
      const charCounts = new Map();
      tokens.forEach(token => {
        for (const char of token) {
          charCounts.set(char, (charCounts.get(char) || 0) + 1);
        }
      });

      // 使用される文字の種類が十分多いことを確認
      expect(charCounts.size).toBeGreaterThan(20);
    });

    it("大量生成でもパフォーマンスが良い", () => {
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        generateGuestToken();
      }
      const end = Date.now();

      // 10000個の生成が1秒以内に完了することを確認
      expect(end - start).toBeLessThan(1000);
    });
  });

  describe("validateGuestToken - Format Validation", () => {
    it("有効な32文字のトークンを受け入れる", async () => {
      const validToken = "abcdefghijklmnopqrstuvwxyz123456";
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ id: "attendance-123" }],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);
      expect(result.isValid).toBe(true);
    });

    it("短すぎるトークンを拒否する", async () => {
      const result = await validateGuestToken("short");
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("無効なゲストトークンです");
    });

    it("長すぎるトークンを拒否する", async () => {
      const longToken = "a".repeat(33);
      const result = await validateGuestToken(longToken);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("無効なゲストトークンです");
    });

    it("無効な文字を含むトークンを拒否する", async () => {
      const invalidToken = "abcdefghijklmnopqrstuvwxyz123@#$";
      const result = await validateGuestToken(invalidToken);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("無効なゲストトークンです");
    });

    it("空文字列を拒否する", async () => {
      const result = await validateGuestToken("");
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe("無効なゲストトークンです");
    });

    it("nullやundefinedを拒否する", async () => {
      const nullResult = await validateGuestToken(null as any);
      expect(nullResult.isValid).toBe(false);

      const undefinedResult = await validateGuestToken(undefined as any);
      expect(undefinedResult.isValid).toBe(false);
    });

    it("アンダースコアとハイフンを含むトークンを受け入れる", async () => {
      const validToken = "abcdefgh_ijklmno-pqrstuvwxyz1234";
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ id: "attendance-123" }],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);
      expect(result.isValid).toBe(true);
    });
  });

  describe("validateGuestToken - Database Validation", () => {
    const validToken = "abcdefghijklmnopqrstuvwxyz123456";
    const mockAttendanceData = {
      id: "attendance-123",
      event_id: "event-456",
      nickname: "テストユーザー",
      email: "test@example.com",
      status: "attending",
      guest_token: validToken,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      event: {
        id: "event-456",
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
      },
    };

    it("存在するトークンで正常なデータを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [mockAttendanceData],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(true);
      expect(result.attendance).toEqual(mockAttendanceData);
      expect(result.canModify).toBe(true);
      expect(result.errorMessage).toBeUndefined();
    });

    it("存在しないトークンを拒否する", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken("nonexistenttoken123456789012345678");

      expect(result.isValid).toBe(false);
      expect(result.attendance).toBeUndefined();
      expect(result.canModify).toBe(false);
      expect(result.errorMessage).toBe("ゲストトークンが見つかりません");
    });

    it("データベースエラー時は適切なエラーメッセージを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: { message: "Database connection failed" },
          }),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(false);
      expect(result.canModify).toBe(false);
      expect(result.errorMessage).toBe("ゲストトークンの検証中にエラーが発生しました");
    });

    it("予期しないエラー時は適切なエラーメッセージを返す", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockRejectedValue(new Error("Unexpected error")),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(false);
      expect(result.canModify).toBe(false);
      expect(result.errorMessage).toBe("ゲストトークンの検証中にエラーが発生しました");
    });

    it("複数の結果が返された場合は最初のものを使用する", async () => {
      const multipleData = [
        mockAttendanceData,
        { ...mockAttendanceData, id: "attendance-789" },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: multipleData,
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(true);
      expect(result.attendance?.id).toBe("attendance-123");
    });
  });

  describe("validateGuestToken - Modification Rules", () => {
    const validToken = "abcdefghijklmnopqrstuvwxyz123456";

    it("upcoming イベントは変更可能", async () => {
      const upcomingEvent = {
        id: "attendance-123",
        event: {
          status: "upcoming",
          registration_deadline: "2030-12-31T23:59:59Z", // 未来の日付
        },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [upcomingEvent],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(true);
    });

    it("cancelled イベントは変更不可", async () => {
      const cancelledEvent = {
        id: "attendance-123",
        event: {
          status: "cancelled",
        },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [cancelledEvent],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(false);
    });

    it("past イベントは変更不可", async () => {
      const pastEvent = {
        id: "attendance-123",
        event: {
          status: "past",
        },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [pastEvent],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(false);
    });

    it("申込期限が過ぎたイベントは変更不可", async () => {
      const expiredEvent = {
        id: "attendance-123",
        event: {
          status: "upcoming",
          registration_deadline: "2020-01-01T00:00:00Z", // 過去の日付
        },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [expiredEvent],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(false);
    });

    it("申込期限がnullの場合は変更可能", async () => {
      const noDeadlineEvent = {
        id: "attendance-123",
        event: {
          status: "upcoming",
          registration_deadline: null,
        },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [noDeadlineEvent],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(true);
    });

    it("申込期限が未来の場合は変更可能", async () => {
      const futureDeadlineEvent = {
        id: "attendance-123",
        event: {
          status: "upcoming",
          registration_deadline: "2030-12-31T23:59:59Z", // 未来の日付
        },
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [futureDeadlineEvent],
            error: null,
          }),
        }),
      });

      const result = await validateGuestToken(validToken);

      expect(result.isValid).toBe(true);
      expect(result.canModify).toBe(true);
    });
  });

  describe("validateGuestToken - Query Parameters", () => {
    const validToken = "abcdefghijklmnopqrstuvwxyz123456";

    it("正しいクエリパラメータでデータベースにアクセスする", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });
      const mockEq = jest.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      mockSelect.mockReturnValue({
        eq: mockEq,
      });

      await validateGuestToken(validToken);

      expect(mockSupabase.from).toHaveBeenCalledWith("attendances");
      expect(mockSelect).toHaveBeenCalledWith(`
        id,
        event_id,
        nickname,
        email,
        status,
        guest_token,
        created_at,
        updated_at,
        event:events (
          id,
          title,
          date,
          location,
          description,
          fee,
          capacity,
          payment_methods,
          registration_deadline,
          payment_deadline,
          status
        )
      `);
      expect(mockEq).toHaveBeenCalledWith("guest_token", validToken);
    });
  });

  describe("Integration with generateGuestToken", () => {
    it("生成されたトークンが検証可能な形式である", () => {
      for (let i = 0; i < 100; i++) {
        const token = generateGuestToken();

        // 長さチェック
        expect(token).toHaveLength(32);

        // 文字チェック
        expect(token).toMatch(/^[a-zA-Z0-9_-]+$/);

        // パディングなし
        expect(token).not.toContain("=");
      }
    });

    it("生成されたトークンがユニークである", () => {
      const tokens = new Set();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        const token = generateGuestToken();
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
      }

      expect(tokens.size).toBe(count);
    });
  });

  describe("Security Considerations", () => {
    it("トークンが推測困難である", () => {
      const tokens = [];
      for (let i = 0; i < 1000; i++) {
        tokens.push(generateGuestToken());
      }

      // 連続するトークンに明らかなパターンがないことを確認
      for (let i = 1; i < tokens.length; i++) {
        const prev = tokens[i - 1];
        const curr = tokens[i];

        // 完全に同じでないことを確認
        expect(curr).not.toBe(prev);

        // 1文字だけ違うような単純なパターンでないことを確認
        let diffCount = 0;
        for (let j = 0; j < 32; j++) {
          if (prev[j] !== curr[j]) {
            diffCount++;
          }
        }
        expect(diffCount).toBeGreaterThan(10); // 十分な違いがあることを確認
      }
    });

    it("トークンに時間的な情報が含まれていない", () => {
      const start = Date.now();
      const tokens = [];

      for (let i = 0; i < 100; i++) {
        tokens.push(generateGuestToken());
        // 少し待つ
        const now = Date.now();
        while (Date.now() - now < 1) {
          // 1ms待つ
        }
      }

      const end = Date.now();

      // 時間順にソートしても、トークンに明らかな順序がないことを確認
      const sortedTokens = [...tokens].sort();
      expect(sortedTokens).not.toEqual(tokens);
    });
  });

  describe("Performance Tests", () => {
    it("大量のトークン生成が効率的である", () => {
      const start = Date.now();
      const tokens = [];

      for (let i = 0; i < 10000; i++) {
        tokens.push(generateGuestToken());
      }

      const end = Date.now();
      const duration = end - start;

      // 10000個の生成が1秒以内に完了することを確認
      expect(duration).toBeLessThan(1000);
      expect(tokens).toHaveLength(10000);
    });

    it("大量の検証が効率的である", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      const start = Date.now();
      const promises = [];

      for (let i = 0; i < 100; i++) {
        const token = generateGuestToken();
        promises.push(validateGuestToken(token));
      }

      await Promise.all(promises);
      const end = Date.now();
      const duration = end - start;

      // 100個の検証が2秒以内に完了することを確認
      expect(duration).toBeLessThan(2000);
    });
  });
});