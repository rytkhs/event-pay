/**
 * @jest-environment node
 */
import { GET } from "@/app/api/invite/[token]/route";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateInviteToken } from "@/lib/utils/invite-token";

// 依存関係をモック
jest.mock("@/lib/supabase/server");
jest.mock("@/lib/rate-limit-middleware", () => ({
  handleRateLimit: jest.fn().mockResolvedValue(null), // レート制限にヒットしない
}));

const mockSupabase = {
  from: jest.fn(),
};

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe("招待APIルート", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
  });

  describe("GET /api/invite/[token]", () => {
    it("トークンがない場合、400を返すこと", async () => {
      const request = new NextRequest("http://localhost:3000/api/invite/");
      const response = await GET(request, { params: { token: "" } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("招待トークンが必要です");
    });

    it("無効なトークンの場合、404を返すこと", async () => {
      const request = new NextRequest("http://localhost:3000/api/invite/invalid");

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

      const response = await GET(request, { params: { token: "invalid" } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe("無効な招待リンクです");
    });

    it("有効なトークンの場合、イベントデータを返すこと", async () => {
      const validToken = generateInviteToken();
      const request = new NextRequest(`http://localhost:3000/api/invite/${validToken}`);

      const mockEvent = {
        id: "event-1",
        title: "テストイベント",
        date: new Date(Date.now() + 86400000).toISOString(),
        location: "テストロケーション",
        description: "テスト説明",
        fee: 1000,
        capacity: 50,
        payment_methods: ["stripe", "cash"],
        registration_deadline: new Date(Date.now() + 43200000).toISOString(),
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

      const response = await GET(request, { params: { token: validToken } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data?.event.id).toBe("event-1");
      expect(data.data?.isCapacityReached).toBe(false);
      expect(data.data?.isRegistrationOpen).toBe(true);
    });

    it("定員に達している場合、その旨を示すこと", async () => {
      const validToken = generateInviteToken();
      const request = new NextRequest(`http://localhost:3000/api/invite/${validToken}`);

      const mockEvent = {
        id: "event-1",
        title: "テストイベント",
        date: new Date(Date.now() + 86400000).toISOString(),
        location: "テストロケーション",
        description: "テスト説明",
        fee: 1000,
        capacity: 2,
        payment_methods: ["stripe", "cash"],
        registration_deadline: new Date(Date.now() + 43200000).toISOString(),
        payment_deadline: new Date(Date.now() + 43200000).toISOString(),
        status: "upcoming",
        invite_token: validToken,
        attendances: [{ id: "1" }, { id: "2" }], // 定員に達している
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

      const response = await GET(request, { params: { token: validToken } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data?.isCapacityReached).toBe(true);
    });

    it("サーバーエラーを適切に処理すること", async () => {
      const validToken = generateInviteToken();
      const request = new NextRequest(`http://localhost:3000/api/invite/${validToken}`);

      mockSupabase.from.mockImplementation(() => {
        throw new Error("データベースエラー");
      });

      const response = await GET(request, { params: { token: validToken } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe("招待リンクの検証中にエラーが発生しました");
    });
  });
});
