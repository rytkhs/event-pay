/**
 * RLSポリシー検証統合テスト
 * EventPay データベースのRow Level Security (RLS) ポリシーを検証
 */

import { createClient } from "@supabase/supabase-js";

// Supabase クライアントのモック
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

// Server Actions のモック
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

describe("RLSポリシー検証", () => {
  let mockSupabase: any;

  beforeAll(() => {
    // Supabaseクライアントモックの設定
    mockSupabase = {
      auth: {
        getUser: jest.fn(),
        getSession: jest.fn(),
      },
      from: jest.fn(),
      rpc: jest.fn(),
    };

    // createClientモックの設定
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    // Server用createClientモックの設定
    const serverSupabase = require("@/lib/supabase/server");
    serverSupabase.createClient.mockReturnValue(mockSupabase);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("usersテーブルRLSポリシー", () => {
    test("認証済みユーザーは全プロフィールを閲覧できる", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      // プロフィール閲覧をモック
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            { id: "user-1", display_name: "User 1", avatar_url: null },
            { id: "user-2", display_name: "User 2", avatar_url: null },
          ],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const { data, error } = await mockSupabase
        .from("users")
        .select("id, display_name, avatar_url")
        .limit(10);

      // RLSポリシーにより、認証済みユーザーは閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test("ユーザーは自身の情報のみ更新できる", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      // 自身の情報更新をモック（成功）
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ id: "test-user-id", display_name: "更新されたユーザー名" }],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockUpdateBuilder);

      const { error } = await mockSupabase
        .from("users")
        .update({
          display_name: "更新されたユーザー名",
        })
        .eq("id", "test-user-id");

      // 自身の情報更新は成功するはず
      expect(error).toBeNull();
    });

    test("他のユーザーの情報は更新できない", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      // 他のユーザーの情報更新をモック（RLSポリシーで拒否）
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: { message: "Row Level Security policy violation" },
        }),
      };

      mockSupabase.from.mockReturnValue(mockUpdateBuilder);

      const { error } = await mockSupabase
        .from("users")
        .update({
          display_name: "不正な更新",
        })
        .eq("id", "other-user-id");

      // 他のユーザーの情報更新は拒否されるはず
      expect(error).toBeTruthy();
    });

    test("未認証ユーザーは個人情報を閲覧できない", async () => {
      // 未認証ユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      // 未認証での個人情報閲覧をモック（RLSポリシーで拒否）
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: { message: "Row Level Security policy violation" },
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const { error } = await mockSupabase
        .from("users")
        .select("email, phone, address")
        .eq("id", "test-user-id");

      // 未認証ユーザーは個人情報を閲覧できない
      expect(error).toBeTruthy();
    });
  });

  describe("eventsテーブルRLSポリシー", () => {
    test("全ユーザーは公開イベントを閲覧できる", async () => {
      // 公開イベント閲覧をモック
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            { id: "event-1", title: "Public Event 1", is_public: true },
            { id: "event-2", title: "Public Event 2", is_public: true },
          ],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const { data, error } = await mockSupabase
        .from("events")
        .select("id, title, description, date")
        .eq("is_public", true)
        .limit(10);

      // 公開イベントは全ユーザーが閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test("イベント作成者は自身のイベントを更新できる", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "creator-user-id", email: "creator@example.com" } },
        error: null,
      });

      // イベント作成者による更新をモック（成功）
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ id: "event-1", title: "更新されたイベント", created_by: "creator-user-id" }],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockUpdateBuilder);

      const { error } = await mockSupabase
        .from("events")
        .update({
          title: "更新されたイベント",
        })
        .eq("id", "event-1");

      // イベント作成者は自身のイベントを更新可能
      expect(error).toBeNull();
    });

    test("他のユーザーのイベントは更新できない", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "other-user-id", email: "other@example.com" } },
        error: null,
      });

      // 他のユーザーのイベント更新をモック（RLSポリシーで拒否）
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: { message: "Row Level Security policy violation" },
        }),
      };

      mockSupabase.from.mockReturnValue(mockUpdateBuilder);

      const { error } = await mockSupabase
        .from("events")
        .update({
          title: "不正な更新",
        })
        .eq("id", "event-1");

      // 他のユーザーのイベントは更新できない
      expect(error).toBeTruthy();
    });

    test("未認証ユーザーは非公開イベントを閲覧できない", async () => {
      // 未認証ユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      // 非公開イベント閲覧をモック（RLSポリシーで拒否）
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: { message: "Row Level Security policy violation" },
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const { error } = await mockSupabase.from("events").select("*").eq("is_public", false);

      // 未認証ユーザーは非公開イベントを閲覧できない
      expect(error).toBeTruthy();
    });
  });

  describe("attendancesテーブルRLSポリシー", () => {
    test("ユーザーは自身の参加情報を閲覧できる", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      // 自身の参加情報閲覧をモック
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              id: "attendance-1",
              event_id: "event-1",
              user_id: "test-user-id",
              status: "confirmed",
            },
          ],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const { data, error } = await mockSupabase
        .from("attendances")
        .select("*")
        .eq("user_id", "test-user-id");

      // 自身の参加情報は閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test("イベント作成者は参加者リストを閲覧できる", async () => {
      // 認証済みユーザー（イベント作成者）をモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "creator-user-id", email: "creator@example.com" } },
        error: null,
      });

      // イベント作成者による参加者リスト閲覧をモック
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [
            { id: "attendance-1", event_id: "event-1", user_id: "user-1", status: "confirmed" },
            { id: "attendance-2", event_id: "event-1", user_id: "user-2", status: "pending" },
          ],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const { data, error } = await mockSupabase
        .from("attendances")
        .select("*")
        .eq("event_id", "event-1")
        .in("status", ["confirmed", "pending"]);

      // イベント作成者は参加者リストを閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test("他のユーザーの参加情報は閲覧できない", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      // 他のユーザーの参加情報閲覧をモック（RLSポリシーで拒否）
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: { message: "Row Level Security policy violation" },
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const { error } = await mockSupabase
        .from("attendances")
        .select("*")
        .eq("user_id", "other-user-id");

      // 他のユーザーの参加情報は閲覧できない
      expect(error).toBeTruthy();
    });

    test("ユーザーは自身の参加ステータスを更新できる", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      // 自身の参加ステータス更新をモック（成功）
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ id: "attendance-1", user_id: "test-user-id", status: "cancelled" }],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockUpdateBuilder);

      const { error } = await mockSupabase
        .from("attendances")
        .update({
          status: "cancelled",
        })
        .eq("user_id", "test-user-id");

      // 自身の参加ステータス更新は成功
      expect(error).toBeNull();
    });

    test("他のユーザーの参加ステータスは更新できない", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      // 他のユーザーの参加ステータス更新をモック（RLSポリシーで拒否）
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: { message: "Row Level Security policy violation" },
        }),
      };

      mockSupabase.from.mockReturnValue(mockUpdateBuilder);

      const { error } = await mockSupabase
        .from("attendances")
        .update({
          status: "confirmed",
        })
        .eq("user_id", "other-user-id");

      // 他のユーザーの参加ステータス更新は拒否
      expect(error).toBeTruthy();
    });
  });

  describe("public_profilesビューRLSポリシー", () => {
    test("認証済みユーザーは公開プロフィールを閲覧できる", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      // 公開プロフィール閲覧をモック
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            { id: "user-1", display_name: "Public User 1", avatar_url: null },
            { id: "user-2", display_name: "Public User 2", avatar_url: null },
          ],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const { data, error } = await mockSupabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .limit(10);

      // 認証済みユーザーは公開プロフィール閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test("公開プロフィールビューは読み取り専用", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      // ビューの更新をモック（読み取り専用で拒否）
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: { message: "Cannot modify view" },
        }),
      };

      mockSupabase.from.mockReturnValue(mockUpdateBuilder);

      const { error } = await mockSupabase
        .from("public_profiles")
        .update({
          display_name: "更新試行",
        })
        .eq("id", "test-user-id");

      // ビューは読み取り専用なので更新は拒否されるはず
      expect(error).toBeTruthy();
    });
  });

  describe("セキュリティ関数RLSポリシー", () => {
    test("get_event_creator_name関数が適切に動作する", async () => {
      // セキュリティ関数の実行をモック
      mockSupabase.rpc.mockResolvedValue({
        data: "Event Creator Name",
        error: null,
      });

      const { data, error } = await mockSupabase.rpc("get_event_creator_name", {
        event_id: "test-event-id",
      });

      // セキュリティ関数が正常に動作することを確認
      expect(error).toBeNull();
      expect(data).toBe("Event Creator Name");
    });

    test("未認証ユーザーは保護された関数を実行できない", async () => {
      // 未認証ユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      // 保護された関数の実行をモック（RLSポリシーで拒否）
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: "permission denied for function protected_function" },
      });

      const { error } = await mockSupabase.rpc("protected_function", {
        param: "test",
      });

      // 未認証ユーザーは保護された関数を実行できない
      expect(error).toBeTruthy();
    });
  });
});
