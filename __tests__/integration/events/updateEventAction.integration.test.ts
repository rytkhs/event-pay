// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn(),
};

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => mockSupabaseClient,
}));

// revalidatePathをモック
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

import { updateEventAction } from "@/app/events/actions/update-event";

// 統合テスト - 新しいモック戦略を使用
describe("updateEventAction - Integration Tests", () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // 統合テストレベルのモック設定
    // 完全なSupabaseクエリビルダーのモック
    const createQueryBuilder = () => ({
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
      contains: jest.fn().mockReturnThis(),
      containedBy: jest.fn().mockReturnThis(),
      rangeGt: jest.fn().mockReturnThis(),
      rangeGte: jest.fn().mockReturnThis(),
      rangeLt: jest.fn().mockReturnThis(),
      rangeLte: jest.fn().mockReturnThis(),
      rangeAdjacent: jest.fn().mockReturnThis(),
      overlaps: jest.fn().mockReturnThis(),
      textSearch: jest.fn().mockReturnThis(),
      match: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      abortSignal: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockReturnThis(),
      csv: jest.fn().mockReturnThis(),
      geojson: jest.fn().mockReturnThis(),
      explain: jest.fn().mockReturnThis(),
      rollback: jest.fn().mockReturnThis(),
      returns: jest.fn().mockReturnThis(),
    });

    // fromメソッドのデフォルト設定
    mockSupabaseClient.from.mockImplementation(() => createQueryBuilder());
  });

  // 認証・権限系テストケース
  describe("認証・権限エラーケース", () => {
    it("未認証ユーザーがイベント更新を実行した場合、認証エラーが返される", async () => {
      // Arrange
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const formData = new FormData();
      formData.append("title", "更新されたタイトル");
      formData.append("date", "2024-12-31T10:00");
      formData.append("fee", "1000");
      formData.append("payment_methods", "stripe");

      // Act
      const result = await updateEventAction("550e8400-e29b-41d4-a716-446655440000", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("認証が必要です");
        expect(result.code).toBe("UNAUTHORIZED");
      }
    });

    it("無効なイベントIDで更新した場合、エラーが返される", async () => {
      // Arrange
      const formData = new FormData();
      formData.append("title", "更新されたタイトル");

      // Act
      const result = await updateEventAction("invalid-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("無効なイベントIDです");
        expect(result.code).toBe("INVALID_INPUT");
      }
    });
  });

  // 参加者制限系テストケース
  describe("参加者制限エラーケース", () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
    });

    it("参加者がいる状態で参加費を変更した場合、エラーが返される", async () => {
      // Arrange
      const eventData = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        created_by: "user-1",
        title: "既存のタイトル",
        date: "2025-12-25T10:00:00+09:00",
        fee: 1000,
        payment_methods: ["stripe"],
        attendances: [{ id: "attendance-1", status: "attending" }],
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: eventData,
          error: null,
        }),
      });

      const formData = new FormData();
      formData.append("fee", "1500"); // 参加費変更のみ

      // Act
      const result = await updateEventAction("550e8400-e29b-41d4-a716-446655440000", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("参加者がいるため、参加費は変更できません");
        expect(result.code).toBe("EDIT_RESTRICTION");
      }
    });
  });

  // 成功ケース - 統合テスト
  describe("成功ケース", () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
    });

    it("正常なデータでイベントが更新される", async () => {
      // Arrange
      const existingEvent = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        created_by: "user-1",
        title: "既存のタイトル",
        date: "2024-12-25T10:00:00+09:00",
        fee: 1000,
        attendances: [], // 参加者なし
      };

      const updatedEvent = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "更新されたタイトル",
        date: "2024-12-26T10:00:00+09:00",
        fee: 1500,
      };

      // 2つの異なるクエリビルダーを作成
      const selectBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: existingEvent,
          error: null,
        }),
      };

      const updateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: updatedEvent,
          error: null,
        }),
      };

      // fromの呼び出し順序に応じて異なるビルダーを返す
      mockSupabaseClient.from.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(updateBuilder);

      const formData = new FormData();
      formData.append("title", "更新されたタイトル");
      formData.append("date", "2025-12-26T10:00");
      formData.append("fee", "1500");
      formData.append("payment_methods", "stripe");

      // Act
      const result = await updateEventAction("550e8400-e29b-41d4-a716-446655440000", formData);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "更新されたタイトル",
        });
        expect(result.message).toBe("イベントが正常に更新されました");
      }
    });
  });
});
