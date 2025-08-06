import { validateInviteTokenAction } from "@/app/events/actions/validate-invite-token";
import { createClient } from "@/lib/supabase/server";
import { generateInviteToken } from "@/lib/utils/invite-token";

// Supabaseクライアントをモック
jest.mock("@/lib/supabase/server");

const mockSupabase = {
  from: jest.fn(),
};

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe("招待トークン検証の統合テスト", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
  });

  describe("validateInviteTokenAction", () => {
    it("空のトークンに対してエラーを返すこと", async () => {
      const result = await validateInviteTokenAction("");

      expect(result.success).toBe(false);
      expect(result.error).toBe("招待トークンが必要です");
    });

    it("無効な形式のトークンに対してエラーを返すこと", async () => {
      const result = await validateInviteTokenAction("invalid-token");

      expect(result.success).toBe(false);
      expect(result.error).toBe("無効な招待リンクです");
    });

    it("イベントが見つからない場合にエラーを返すこと", async () => {
      const validToken = generateInviteToken();

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "Not found" },
            }),
          }),
        }),
      });

      const result = await validateInviteTokenAction(validToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe("招待リンクが見つかりません");
    });

    it("有効なトークンとアクティブなイベントに対して成功を返すこと", async () => {
      const validToken = generateInviteToken();
      const mockEvent = {
        id: "event-1",
        title: "テストイベント",
        date: new Date(Date.now() + 86400000).toISOString(), // 翌日
        location: "テストロケーション",
        description: "テスト説明",
        fee: 1000,
        capacity: 50,
        payment_methods: ["stripe", "cash"],
        registration_deadline: new Date(Date.now() + 43200000).toISOString(), // 12時間後
        payment_deadline: new Date(Date.now() + 43200000).toISOString(),
        status: "upcoming",
        invite_token: validToken,
        attendances: [],
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockEvent,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteTokenAction(validToken);

      expect(result.success).toBe(true);
      expect(result.data?.event.id).toBe("event-1");
      expect(result.data?.isValid).toBe(true);
      expect(result.data?.canRegister).toBe(true);
    });

    it("キャンセルされたイベントに対して登録不可を返すこと", async () => {
      const validToken = generateInviteToken();
      const mockEvent = {
        id: "event-1",
        title: "キャンセルされたイベント",
        date: new Date(Date.now() + 86400000).toISOString(),
        location: "テストロケーション",
        description: "テスト説明",
        fee: 1000,
        capacity: 50,
        payment_methods: ["stripe", "cash"],
        registration_deadline: null,
        payment_deadline: null,
        status: "cancelled",
        invite_token: validToken,
        attendances: [],
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockEvent,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteTokenAction(validToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe("このイベントはキャンセルされました");
    });

    it("申込期限切れのイベントに対して登録不可を返すこと", async () => {
      const validToken = generateInviteToken();
      const mockEvent = {
        id: "event-1",
        title: "テストイベント",
        date: new Date(Date.now() + 86400000).toISOString(),
        location: "テストロケーション",
        description: "テスト説明",
        fee: 1000,
        capacity: 50,
        payment_methods: ["stripe", "cash"],
        registration_deadline: new Date(Date.now() - 3600000).toISOString(), // 1時間前
        payment_deadline: new Date(Date.now() + 43200000).toISOString(),
        status: "upcoming",
        invite_token: validToken,
        attendances: [],
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockEvent,
              error: null,
            }),
          }),
        }),
      });

      const result = await validateInviteTokenAction(validToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe("参加申込期限が過ぎています");
    });
  });
});
