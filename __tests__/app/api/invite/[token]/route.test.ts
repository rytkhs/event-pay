/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { GET } from "@/app/api/invite/[token]/route";
import { validateInviteToken, checkEventCapacity } from "@/lib/utils/invite-token";
import { handleRateLimit } from "@/lib/rate-limit-middleware";

// Next.js環境のモック
Object.defineProperty(globalThis, 'Request', {
  value: global.Request || class MockRequest { },
});

// モック設定
jest.mock("@/lib/utils/invite-token");
jest.mock("@/lib/rate-limit-middleware");

const mockValidateInviteToken = validateInviteToken as jest.MockedFunction<typeof validateInviteToken>;
const mockCheckEventCapacity = checkEventCapacity as jest.MockedFunction<typeof checkEventCapacity>;
const mockHandleRateLimit = handleRateLimit as jest.MockedFunction<typeof handleRateLimit>;

// テスト用のイベントデータ
const mockEvent = {
  id: "event-123",
  title: "テストイベント",
  date: "2025-08-15T10:00:00Z",
  location: "テスト会場",
  description: "テストイベントの説明",
  fee: 1000,
  capacity: 10,
  payment_methods: ["credit_card", "cash"] as const,
  registration_deadline: "2025-08-10T23:59:59Z",
  payment_deadline: "2025-08-12T23:59:59Z",
  status: "active" as const,
  invite_token: "valid-token-123",
  attendances_count: 5,
};

describe("/api/invite/[token] GET", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleRateLimit.mockResolvedValue(null);
  });

  describe("正常なケース", () => {
    it("有効なトークンでイベント情報を返す", async () => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: mockEvent,
        canRegister: true,
      });
      mockCheckEventCapacity.mockResolvedValue(false);

      const request = new NextRequest("http://localhost/api/invite/valid-token-123");
      const response = await GET(request, { params: { token: "valid-token-123" } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.event).toEqual(mockEvent);
      expect(data.data.isCapacityReached).toBe(false);
      expect(data.data.isRegistrationOpen).toBe(true);
    });

    it("定員に達している場合の情報を返す", async () => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: { ...mockEvent, attendances_count: 10 },
        canRegister: true,
      });
      mockCheckEventCapacity.mockResolvedValue(true);

      const request = new NextRequest("http://localhost/api/invite/valid-token-123");
      const response = await GET(request, { params: { token: "valid-token-123" } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.isCapacityReached).toBe(true);
      expect(data.data.isRegistrationOpen).toBe(false);
      expect(data.error?.code).toBe("CAPACITY_REACHED");
    });
  });

  describe("エラーケース", () => {
    it("トークンが空の場合400エラーを返す", async () => {
      const request = new NextRequest("http://localhost/api/invite/");
      const response = await GET(request, { params: { token: "" } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error?.code).toBe("MISSING_TOKEN");
    });

    it("無効なトークンの場合404エラーを返す", async () => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: false,
        canRegister: false,
        errorMessage: "無効な招待リンクです",
      });

      const request = new NextRequest("http://localhost/api/invite/invalid-token");
      const response = await GET(request, { params: { token: "invalid-token" } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error?.code).toBe("INVALID_TOKEN");
    });

    it("存在しないトークンの場合404エラーを返す", async () => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: false,
        canRegister: false,
        errorMessage: "招待リンクが見つかりません",
      });

      const request = new NextRequest("http://localhost/api/invite/not-found-token");
      const response = await GET(request, { params: { token: "not-found-token" } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error?.code).toBe("TOKEN_NOT_FOUND");
    });

    it("キャンセルされたイベントの場合410エラーを返す", async () => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: { ...mockEvent, status: "cancelled" },
        canRegister: false,
      });

      const request = new NextRequest("http://localhost/api/invite/cancelled-event-token");
      const response = await GET(request, { params: { token: "cancelled-event-token" } });
      const data = await response.json();

      expect(response.status).toBe(410);
      expect(data.success).toBe(false);
      expect(data.error?.code).toBe("EVENT_CANCELLED");
      expect(data.error?.details?.eventId).toBe(mockEvent.id);
    });

    it("終了したイベントの場合410エラーを返す", async () => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: { ...mockEvent, status: "past" },
        canRegister: false,
      });

      const request = new NextRequest("http://localhost/api/invite/past-event-token");
      const response = await GET(request, { params: { token: "past-event-token" } });
      const data = await response.json();

      expect(response.status).toBe(410);
      expect(data.success).toBe(false);
      expect(data.error?.code).toBe("EVENT_ENDED");
      expect(data.error?.details?.eventDate).toBe(mockEvent.date);
    });

    it("登録期限が過ぎた場合410エラーを返す", async () => {
      // 過去の日付を設定
      const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: { ...mockEvent, registration_deadline: pastDeadline },
        canRegister: false,
      });

      const request = new NextRequest("http://localhost/api/invite/expired-token");
      const response = await GET(request, { params: { token: "expired-token" } });
      const data = await response.json();

      expect(response.status).toBe(410);
      expect(data.success).toBe(false);
      expect(data.error?.code).toBe("REGISTRATION_DEADLINE_PASSED");
      expect(data.error?.details?.deadline).toBe(pastDeadline);
    });
  });

  describe("レート制限", () => {
    it("レート制限に達した場合429エラーを返す", async () => {
      const rateLimitResponse = {
        json: () => Promise.resolve({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "レート制限に達しました",
          },
        }),
        status: 429,
      };
      mockHandleRateLimit.mockResolvedValue(rateLimitResponse as any);

      const request = new NextRequest("http://localhost/api/invite/valid-token");
      const response = await GET(request, { params: { token: "valid-token" } });

      expect(response.status).toBe(429);
    });
  });

  describe("内部エラー", () => {
    it("予期しないエラーの場合500エラーを返す", async () => {
      mockValidateInviteToken.mockRejectedValue(new Error("Database error"));

      const request = new NextRequest("http://localhost/api/invite/valid-token");
      const response = await GET(request, { params: { token: "valid-token" } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error?.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });
});