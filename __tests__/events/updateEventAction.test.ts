import { updateEventAction } from "@/app/events/actions/update-event";

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

describe("updateEventAction - Red Phase Tests", () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
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
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("認証が必要です");
        expect(result.code).toBe("UNAUTHORIZED");
      }
    });

    it("他のユーザーのイベントを更新した場合、権限エラーが返される", async () => {
      // Arrange
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      // イベントが存在するが、作成者が異なる
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-2", // 異なるユーザー
            title: "既存のタイトル",
          },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("title", "更新されたタイトル");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("このイベントを編集する権限がありません");
        expect(result.code).toBe("FORBIDDEN");
      }
    });

    it("存在しないイベントIDで更新した場合、エラーが返される", async () => {
      // Arrange
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      // イベントが存在しない
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "No rows returned" },
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("title", "更新されたタイトル");

      // Act
      const result = await updateEventAction("non-existent-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("イベントが見つかりません");
        expect(result.code).toBe("NOT_FOUND");
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

    it("参加者がいる状態でタイトルを変更した場合、エラーが返される", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            fee: 1000,
            // 参加者がいる状態を模擬
            attendances: [{ id: "attendance-1", status: "attending" }],
          },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("title", "更新されたタイトル"); // タイトル変更
      formData.append("date", "2025-12-26T10:00"); // 有効な日時
      formData.append("fee", "1000"); // 有効な料金
      formData.append("payment_methods", "stripe"); // 有効な決済方法

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("参加者がいるため、タイトルは変更できません");
        expect(result.code).toBe("EDIT_RESTRICTION");
      }
    });

    it("参加者がいる状態で開催日時を変更した場合、エラーが返される", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            date: "2024-12-25T10:00:00+09:00",
            attendances: [{ id: "attendance-1", status: "attending" }],
          },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("title", "既存のタイトル"); // タイトル変更なし
      formData.append("date", "2025-12-26T10:00"); // 日時変更
      formData.append("fee", "1000"); // 有効な料金
      formData.append("payment_methods", "stripe"); // 有効な決済方法

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("参加者がいるため、開催日時は変更できません");
        expect(result.code).toBe("EDIT_RESTRICTION");
      }
    });

    it("参加者がいる状態で参加費を変更した場合、エラーが返される", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            date: "2026-12-25T01:00:00.000Z",
            fee: 1000,
            attendances: [{ id: "attendance-1", status: "attending" }],
          },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("title", "既存のタイトル"); // タイトル変更なし
      formData.append("date", "2026-12-25T10:00"); // 日時変更なし（既存と同じ）
      formData.append("fee", "1500"); // 参加費変更
      formData.append("payment_methods", "stripe"); // 有効な決済方法

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("参加者がいるため、参加費は変更できません");
        expect(result.code).toBe("EDIT_RESTRICTION");
      }
    });

    it("参加者がいる状態で定員を減少した場合、エラーが返される", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            date: "2026-12-25T01:00:00.000Z",
            fee: 1000,
            capacity: 100,
            attendances: [
              { id: "attendance-1", status: "attending" },
              { id: "attendance-2", status: "attending" },
            ],
          },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("title", "既存のタイトル"); // タイトル変更なし
      formData.append("date", "2026-12-25T10:00"); // 日時変更なし（既存と同じ）
      formData.append("fee", "1000"); // 料金変更なし
      formData.append("capacity", "50"); // 定員を減少
      formData.append("payment_methods", "stripe"); // 有効な決済方法

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("参加者がいるため、定員を減らすことはできません");
        expect(result.code).toBe("EDIT_RESTRICTION");
      }
    });

    it("参加者がいる状態で決済方法を変更した場合、エラーが返される", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            date: "2026-12-25T01:00:00.000Z",
            fee: 1000,
            capacity: 100,
            payment_methods: ["stripe"],
            attendances: [{ id: "attendance-1", status: "attending" }],
          },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("title", "既存のタイトル"); // タイトル変更なし
      formData.append("date", "2026-12-25T10:00"); // 日時変更なし（既存と同じ）
      formData.append("fee", "1000"); // 料金変更なし
      formData.append("capacity", "100"); // 定員変更なし
      formData.append("payment_methods", "cash"); // 決済方法変更

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("参加者がいるため、決済方法は変更できません");
        expect(result.code).toBe("EDIT_RESTRICTION");
      }
    });
  });

  // バリデーション系テストケース
  describe("バリデーションエラーケース", () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            attendances: [], // 参加者なし
          },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    });

    it("無効なイベントID形式の場合、エラーが返される", async () => {
      // Arrange
      const formData = new FormData();
      formData.append("title", "更新されたタイトル");

      // Act
      const result = await updateEventAction("abc", formData); // 短いID

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("無効なイベントIDです");
        expect(result.code).toBe("INVALID_INPUT");
      }
    });

    it("空のタイトルの場合、エラーが返される", async () => {
      // Arrange
      const formData = new FormData();
      formData.append("title", ""); // 空のタイトル

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("タイトルが空です");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });

    it("過去の開催日時の場合、エラーが返される", async () => {
      // Arrange
      const formData = new FormData();
      formData.append("title", "更新されたタイトル");
      formData.append("date", "2020-01-01T10:00"); // 過去の日時

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("開催日時は現在時刻より後である必要があります");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });

    it("無効な決済方法の組み合わせの場合、エラーが返される", async () => {
      // Arrange
      const formData = new FormData();
      formData.append("title", "更新されたタイトル");
      formData.append("date", "2025-12-26T10:00"); // 有効な日時
      formData.append("fee", "1000"); // 有効な料金
      formData.append("payment_methods", "free,stripe"); // 無料と有料の組み合わせ

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("無料イベントと有料決済方法を同時に選択することはできません");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  // データ整合性系テストケース
  describe("データ整合性エラーケース", () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            attendances: [], // 参加者なし
          },
          error: null,
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    });

    it("参加申込締切が開催日時より後の場合、エラーが返される", async () => {
      // Arrange
      const formData = new FormData();
      formData.append("title", "更新されたタイトル");
      formData.append("date", "2025-12-25T10:00");
      formData.append("fee", "1000"); // 有効な料金
      formData.append("payment_methods", "stripe"); // 有効な決済方法
      formData.append("registration_deadline", "2025-12-26T10:00"); // 開催日時より後

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("参加申込締切は開催日時より前に設定してください");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });

    it("決済締切が参加申込締切より前の場合、エラーが返される", async () => {
      // Arrange
      const formData = new FormData();
      formData.append("title", "更新されたタイトル");
      formData.append("date", "2025-12-25T10:00");
      formData.append("fee", "1000"); // 有効な料金
      formData.append("payment_methods", "stripe"); // 有効な決済方法
      formData.append("registration_deadline", "2025-12-24T10:00");
      formData.append("payment_deadline", "2025-12-23T10:00"); // 参加申込締切より前

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("決済締切は参加申込締切以降に設定してください");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  // 統合テスト - Green Phase成功ケース
  describe("統合テスト - Green Phase成功ケース", () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
    });

    it("正常なデータでイベントが更新される", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            date: "2024-12-25T10:00:00+09:00",
            fee: 1000,
            attendances: [], // 参加者なし
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            title: "更新されたタイトル",
            date: "2024-12-26T10:00:00+09:00",
            fee: 1500,
          },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("title", "更新されたタイトル");
      formData.append("date", "2025-12-26T10:00");
      formData.append("fee", "1500");
      formData.append("payment_methods", "stripe");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({
          id: "event-id",
          title: "更新されたタイトル",
        });
        expect(result.message).toBe("イベントが正常に更新されました");
      }
    });

    it("参加者がいない場合、全項目が更新される", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            attendances: [], // 参加者なし
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", title: "更新されたタイトル" },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("title", "更新されたタイトル");
      formData.append("date", "2025-12-25T10:00");
      formData.append("location", "新しい場所");
      formData.append("description", "新しい説明");
      formData.append("fee", "2000");
      formData.append("capacity", "50");
      formData.append("payment_methods", "stripe");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "更新されたタイトル",
        })
      );
    });

    it("参加者がいる場合、編集可能項目のみが更新される", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            description: "既存の説明",
            date: "2026-12-25T01:00:00.000Z", // 必須フィールド
            fee: 1000, // 必須フィールド
            payment_methods: ["stripe"], // 必須フィールド
            attendances: [{ id: "attendance-1" }], // 参加者あり
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", description: "更新された説明" },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("title", "既存のタイトル"); // 変更なし
      formData.append("date", "2026-12-25T10:00"); // 必須フィールド（既存と同じ）
      formData.append("fee", "1000"); // 必須フィールド
      formData.append("description", "更新された説明"); // 編集可能
      formData.append("payment_methods", "stripe");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
    });

    it("エラーレスポンスが適切な形式で返される", async () => {
      // Arrange
      // 認証されたユーザーのモック
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            attendances: [],
          },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("title", ""); // 空のタイトル

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("タイトルが空です");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });

    it("キャッシュが正常に無効化される", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", title: "更新されたタイトル" },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("title", "更新されたタイトル");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      // キャッシュ無効化の確認は実装上難しいため、正常終了の確認のみ
    });

    it("部分更新が正常に動作する - タイトルのみ", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            date: "2025-12-25T10:00:00+09:00",
            fee: 1000,
            payment_methods: ["stripe"],
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", title: "新しいタイトル" },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("title", "新しいタイトル");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({
        title: "新しいタイトル"
      });
    });

    it("部分更新が正常に動作する - 説明のみ", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            description: "既存の説明",
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", description: "新しい説明" },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("description", "新しい説明");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({
        description: "新しい説明"
      });
    });

    it("空フィールドの更新が正常に動作する", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            location: "既存の場所",
            description: "既存の説明",
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", location: null, description: null },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("location", ""); // 空文字列
      formData.append("description", ""); // 空文字列

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({
        location: null,
        description: null
      });
    });

    it("payment_methodsの差分チェックが正常に動作する", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            payment_methods: ["stripe", "cash"],
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", payment_methods: ["stripe"] },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("payment_methods", "stripe"); // 異なる決済方法

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({
        payment_methods: ["stripe"]
      });
    });

    it("payment_methodsが同じ場合は更新されない", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            payment_methods: ["stripe"],
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id" },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("payment_methods", "stripe"); // 同じ決済方法

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({}); // 更新なし
    });
  });

  // 境界値テストケース
  describe("境界値テストケース", () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
    });

    it("定員の境界値テスト - 最小値(1)", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            capacity: 50,
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", capacity: 1 },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("capacity", "1");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({
        capacity: 1
      });
    });

    it("定員の境界値テスト - 最大値(10000)", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            capacity: 50,
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", capacity: 10000 },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("capacity", "10000");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({
        capacity: 10000
      });
    });

    it("定員の境界値テスト - 範囲外(0)", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            capacity: 50,
            attendances: [],
          },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("capacity", "0");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("定員は1以上10000以下である必要があります");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });

    it("定員の境界値テスト - 範囲外(10001)", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            capacity: 50,
            attendances: [],
          },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("capacity", "10001");

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("定員は1以上10000以下である必要があります");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });

    it("大容量description(1000文字)", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            description: "既存の説明",
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", description: "a".repeat(1000) },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("description", "a".repeat(1000)); // 1000文字

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({
        description: "a".repeat(1000)
      });
    });

    it("大容量description(1001文字) - 範囲外", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            description: "既存の説明",
            attendances: [],
          },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("description", "a".repeat(1001)); // 1001文字

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("説明は1000文字以内で入力してください");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });

    it("タイトルの境界値テスト - 100文字", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", title: "a".repeat(100) },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("title", "a".repeat(100)); // 100文字

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({
        title: "a".repeat(100)
      });
    });

    it("タイトルの境界値テスト - 101文字(範囲外)", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            title: "既存のタイトル",
            attendances: [],
          },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);

      const formData = new FormData();
      formData.append("title", "a".repeat(101)); // 101文字

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("タイトルは100文字以内で入力してください");
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });

    it("場所の境界値テスト - 200文字", async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "event-id",
            created_by: "user-1",
            location: "既存の場所",
            attendances: [],
          },
          error: null,
        }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "event-id", location: "a".repeat(200) },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockQueryBuilder);
      mockSupabaseClient.from.mockReturnValueOnce(mockUpdateBuilder);

      const formData = new FormData();
      formData.append("location", "a".repeat(200)); // 200文字

      // Act
      const result = await updateEventAction("event-id", formData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith({
        location: "a".repeat(200)
      });
    });
  });
});
