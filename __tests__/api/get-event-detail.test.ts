import { getEventDetailAction } from "@/app/events/actions/get-event-detail";
import { redirect } from "next/navigation";

// Mock Supabase
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockRpc = jest.fn();

const mockSupabase = {
  auth: {
    getUser: jest.fn(),
  },
  from: mockFrom,
  rpc: mockRpc,
};

// Mock createClient
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

// Mock redirect from Next.js
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

describe("getEventDetailAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock chain
    mockFrom.mockReturnValue({
      select: mockSelect,
    });
    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: mockSingle,
      }),
    });
  });

  describe("イベント詳細取得テスト", () => {
    test("存在しないイベントIDでアクセスした場合、NotFoundエラーを返す", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user123" } },
        error: null,
      });

      // イベントが見つからない場合をモック
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "No rows found" },
      });

      await expect(getEventDetailAction("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
        "Event not found"
      );
    });

    test("未認証ユーザーがアクセスした場合、認証エラーまたはリダイレクトが発生する", async () => {
      // 未認証ユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      // redirectがモックされているため、実際には処理が継続される
      // redirectが呼ばれることを確認するためのテスト
      const result = await getEventDetailAction("11111111-1111-1111-1111-111111111111");
      expect(redirect).toHaveBeenCalledWith("/auth/login");

      // redirectが呼ばれた後、関数は早期returnするため、undefinedが返される
      expect(result).toBeUndefined();
    });

    test("他ユーザーのイベントにアクセスした場合、アクセス拒否エラーを返す", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user123" } },
        error: null,
      });

      // 他ユーザーのイベント（RLSで弾かれる）をモック
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST301", message: "Row Level Security Policy violated" },
      });

      await expect(getEventDetailAction("22222222-2222-2222-2222-222222222222")).rejects.toThrow(
        "Access denied"
      );
    });

    test("不正なUUID形式のイベントIDでアクセスした場合、バリデーションエラーを返す", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user123" } },
        error: null,
      });

      await expect(getEventDetailAction("invalid-uuid-format")).rejects.toThrow(
        "Invalid event ID format"
      );
    });

    test("データベースエラーが発生した場合、適切なエラーを返す", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user123" } },
        error: null,
      });

      // データベースエラーをモック
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST500", message: "Database connection error" },
      });

      await expect(getEventDetailAction("33333333-3333-3333-3333-333333333333")).rejects.toThrow(
        "Database error"
      );
    });

    test("正常ケース: 認証済みユーザーが自分のイベント詳細を取得する", async () => {
      // 認証済みユーザーをモック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user123" } },
        error: null,
      });

      // 正常なイベントデータをモック
      const mockEventDetail = {
        id: "event123",
        title: "テストイベント",
        date: "2024-12-25T10:00:00",
        location: "テスト会場",
        fee: 1000,
        capacity: 50,
        status: "upcoming",
        description: "テストイベントの説明",
        registration_deadline: "2024-12-20T23:59:59",
        payment_deadline: "2024-12-22T23:59:59",
        payment_methods: ["stripe", "cash"],
        created_at: "2024-12-01T10:00:00",
        updated_at: "2024-12-01T10:00:00",
        created_by: "user123",
        creator_name: "テストユーザー",
      };

      mockSingle.mockResolvedValue({
        data: mockEventDetail,
        error: null,
      });

      // get_event_creator_name関数のモック
      mockRpc.mockResolvedValue({
        data: "テストユーザー",
        error: null,
      });

      const result = await getEventDetailAction("44444444-4444-4444-4444-444444444444");
      expect(result).toBeDefined();
      expect(result!.id).toBe("event123");
      expect(result!.title).toBe("テストイベント");
      expect(result!.creator_name).toBe("テストユーザー");
    });
  });
});
