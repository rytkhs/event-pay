/**
 * @jest-environment node
 */

import { getEventsAction } from "@/app/events/actions/get-events";

// タイムゾーンユーティリティのモック
jest.mock("@/lib/utils/timezone", () => ({
  convertJstDateToUtcRange: jest.fn().mockImplementation((dateString) => ({
    startOfDay: new Date(dateString + "T00:00:00.000Z"),
    endOfDay: new Date(dateString + "T23:59:59.999Z"),
  })),
}));

// モック関数の作成
const mockSupabase = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
};

// Supabaseクライアントをモック
jest.mock("@/lib/supabase/server", () => ({
  createClient: () => mockSupabase,
}));

describe("getEventsAction バリデーションテスト", () => {
  const mockUser = { id: "test-user-id" };

  beforeEach(() => {
    jest.clearAllMocks();

    // 認証成功をモック
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    // 総件数クエリとイベントクエリの結果をモック
    const mockCountPromise = Promise.resolve({
      count: 1,
      error: null,
    });

    const mockEventsPromise = Promise.resolve({
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
    });

    // Promise.allの実行をモック
    jest.spyOn(Promise, "all").mockResolvedValue([mockCountPromise, mockEventsPromise]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("sortOrder バリデーション", () => {
    it("should reject invalid sortOrder values", async () => {
      // 無効なsortOrder値でテスト
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
      expect(mockSupabase.order).toHaveBeenCalledWith("date", { ascending: true });
    });

    it("should handle sortBy validation", async () => {
      // 無効なsortBy値でテスト
      const result = await getEventsAction({
        sortBy: "invalid" as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("sortBy");
    });

    it("should handle statusFilter validation", async () => {
      // 無効なstatusFilter値でテスト
      const result = await getEventsAction({
        statusFilter: "invalid" as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("statusFilter");
    });

    it("should handle paymentFilter validation", async () => {
      // 無効なpaymentFilter値でテスト
      const result = await getEventsAction({
        paymentFilter: "invalid" as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("paymentFilter");
    });
  });
});
