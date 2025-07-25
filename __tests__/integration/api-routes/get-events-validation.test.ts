/**
 * @jest-environment node
 * @file getEventsActionバリデーション統合テスト - 進化版
 * @description イベント一覧取得Server Actionのバリデーション統合テスト
 * @version 2.0.0 - ハイブリッド統合テスト（実バリデーション + 外部依存モック）
 */

import { getEventsAction } from "@/app/events/actions/get-events";

// Supabase Server クライアントのモック（外部依存のみモック）
const mockSupabaseQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockResolvedValue({
    data: [
      {
        id: "event-1",
        title: "Test Event",
        date: "2025-01-01T10:00:00Z",
        location: "Test Location",
        fee: 1000,
        capacity: 50,
        status: "upcoming",
        created_by: "test-user-id",
        created_at: "2024-12-01T00:00:00Z",
        public_profiles: { name: "Test User" },
        attendances: { count: 10 },
      },
    ],
    error: null,
    count: 1,
  }),
};

const mockSupabaseClient = {
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: { id: "test-user-id" } },
      error: null,
    }),
  },
  from: jest.fn().mockReturnValue(mockSupabaseQuery),
};

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

describe("getEventsAction バリデーションテスト（進化版）", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // 各テスト前にモックをリセット
    mockSupabaseQuery.select.mockReturnThis();
    mockSupabaseQuery.eq.mockReturnThis();
    mockSupabaseQuery.gte.mockReturnThis();
    mockSupabaseQuery.lte.mockReturnThis();
    mockSupabaseQuery.gt.mockReturnThis();
    mockSupabaseQuery.order.mockReturnThis();
    mockSupabaseQuery.range.mockResolvedValue({
      data: [
        {
          id: "event-1",
          title: "Test Event",
          date: "2025-01-01T10:00:00Z",
          location: "Test Location",
          fee: 1000,
          capacity: 50,
          status: "upcoming",
          created_by: "test-user-id",
          created_at: "2024-12-01T00:00:00Z",
          public_profiles: { name: "Test User" },
          attendances: { count: 10 },
        },
      ],
      error: null,
      count: 1,
    });
  });

  describe("sortOrder バリデーション", () => {
    it("should reject invalid sortOrder values", async () => {
      const result = await getEventsAction({
        sortOrder: "invalid" as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("sortOrder");
    });

    it("should accept valid sortOrder values", async () => {
      // 有効なsortOrder値('asc')でテスト
      const result1 = await getEventsAction({
        sortOrder: "asc",
      });

      expect(result1.success).toBe(true);

      // 有効なsortOrder値('desc')でテスト
      const result2 = await getEventsAction({
        sortOrder: "desc",
      });

      expect(result2.success).toBe(true);
    });

    it("should use default sortOrder when not provided", async () => {
      const result = await getEventsAction({});

      expect(result.success).toBe(true);

      // デフォルト値'asc'が使用されることを確認
      expect(mockSupabaseQuery.order).toHaveBeenCalledWith("date", { ascending: true });
    });

    it("should handle sortBy validation", async () => {
      // 有効なsortBy値でテスト
      const validResult = await getEventsAction({
        sortBy: "date",
      });

      expect(validResult.success).toBe(true);

      // 無効なsortBy値でテスト
      const invalidResult = await getEventsAction({
        sortBy: "invalid" as any,
      });

      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain("sortBy");
    });

    it("should handle statusFilter validation", async () => {
      // 有効なstatusFilter値でテスト
      const validResult = await getEventsAction({
        statusFilter: "upcoming",
      });

      expect(validResult.success).toBe(true);

      // 無効なstatusFilter値でテスト
      const invalidResult = await getEventsAction({
        statusFilter: "invalid" as any,
      });

      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain("statusFilter");
    });

    it("should handle paymentFilter validation", async () => {
      // 有効なpaymentFilter値でテスト
      const validResult = await getEventsAction({
        paymentFilter: "free",
      });

      expect(validResult.success).toBe(true);

      // 無効なpaymentFilter値でテスト
      const invalidResult = await getEventsAction({
        paymentFilter: "invalid" as any,
      });

      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain("paymentFilter");
    });
  });
});
