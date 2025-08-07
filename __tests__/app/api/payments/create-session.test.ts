/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/payments/create-session/route";

// Web API のモック
global.Request = jest.fn();
global.Response = jest.fn();
global.Headers = jest.fn();
global.fetch = jest.fn();

// モック設定
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
    })),
  })),
}));

jest.mock("@/lib/rate-limit-middleware", () => ({
  handleRateLimit: jest.fn(),
}));

jest.mock("@/lib/services/payment", () => ({
  PaymentService: jest.fn().mockImplementation(() => ({
    createStripeSession: jest.fn(),
  })),
  PaymentErrorHandler: jest.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { handleRateLimit } from "@/lib/rate-limit-middleware";
import { PaymentService } from "@/lib/services/payment";

describe("/api/payments/create-session", () => {
  let mockSupabase: any;
  let mockPaymentService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: jest.fn(),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(),
          })),
        })),
      })),
    };

    mockPaymentService = {
      createStripeSession: jest.fn(),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    (PaymentService as jest.Mock).mockImplementation(() => mockPaymentService);
    (handleRateLimit as jest.Mock).mockResolvedValue(null);
  });

  const createRequest = (body: any) => {
    return new NextRequest("http://localhost:3000/api/payments/create-session", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  describe("正常系", () => {
    it("有効なリクエストでStripe決済セッションを作成する", async () => {
      const requestBody = {
        attendanceId: "att_test_123",
        amount: 1000,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const mockUser = { id: "user_test_123" };
      const mockAttendance = {
        id: "att_test_123",
        user_id: "user_test_123",
        event_id: "event_test_123",
        events: {
          id: "event_test_123",
          title: "テストイベント",
          fee: 1000,
          created_by: "user_test_123",
        },
      };

      const mockSessionResult = {
        sessionUrl: "https://checkout.stripe.com/pay/cs_test_123",
        sessionId: "cs_test_123",
      };

      // モックの設定
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabase.from().select().eq().single.mockResolvedValueOnce({
        data: mockAttendance,
        error: null,
      });

      mockSupabase
        .from()
        .select()
        .eq()
        .single.mockResolvedValueOnce({
          data: null,
          error: { code: "PGRST116" }, // 既存決済なし
        });

      mockPaymentService.createStripeSession.mockResolvedValue(mockSessionResult);

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.data.sessionUrl).toBe("https://checkout.stripe.com/pay/cs_test_123");
      expect(responseData.data.sessionId).toBe("cs_test_123");
    });
  });

  describe("認証エラー", () => {
    it("未認証ユーザーの場合、401エラーを返す", async () => {
      const requestBody = {
        attendanceId: "att_test_123",
        amount: 1000,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(401);
      expect(responseData.success).toBe(false);
      expect(responseData.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("バリデーションエラー", () => {
    it("無効なattendanceIdの場合、400エラーを返す", async () => {
      const requestBody = {
        attendanceId: "invalid-uuid",
        amount: 1000,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const mockUser = { id: "user_test_123" };
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.success).toBe(false);
      expect(responseData.error.code).toBe("VALIDATION_ERROR");
    });

    it("負の金額の場合、400エラーを返す", async () => {
      const requestBody = {
        attendanceId: "att_test_123",
        amount: -100,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const mockUser = { id: "user_test_123" };
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.success).toBe(false);
      expect(responseData.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("権限エラー", () => {
    it("他人の参加記録にアクセスしようとした場合、403エラーを返す", async () => {
      const requestBody = {
        attendanceId: "att_test_123",
        amount: 1000,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const mockUser = { id: "user_test_123" };
      const mockAttendance = {
        id: "att_test_123",
        user_id: "other_user_123", // 他のユーザー
        event_id: "event_test_123",
        events: {
          id: "event_test_123",
          title: "テストイベント",
          fee: 1000,
          created_by: "other_user_456", // 他の主催者
        },
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockAttendance,
        error: null,
      });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(403);
      expect(responseData.success).toBe(false);
      expect(responseData.error.code).toBe("FORBIDDEN");
    });
  });

  describe("ビジネスロジックエラー", () => {
    it("金額がイベント参加費と一致しない場合、400エラーを返す", async () => {
      const requestBody = {
        attendanceId: "att_test_123",
        amount: 2000, // イベント参加費と異なる
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const mockUser = { id: "user_test_123" };
      const mockAttendance = {
        id: "att_test_123",
        user_id: "user_test_123",
        event_id: "event_test_123",
        events: {
          id: "event_test_123",
          title: "テストイベント",
          fee: 1000, // 実際の参加費
          created_by: "user_test_123",
        },
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockAttendance,
        error: null,
      });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.success).toBe(false);
      expect(responseData.error.code).toBe("AMOUNT_MISMATCH");
    });

    it("既に決済レコードが存在する場合、409エラーを返す", async () => {
      const requestBody = {
        attendanceId: "att_test_123",
        amount: 1000,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const mockUser = { id: "user_test_123" };
      const mockAttendance = {
        id: "att_test_123",
        user_id: "user_test_123",
        event_id: "event_test_123",
        events: {
          id: "event_test_123",
          title: "テストイベント",
          fee: 1000,
          created_by: "user_test_123",
        },
      };

      const mockExistingPayment = {
        id: "pay_test_123",
        status: "pending",
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabase
        .from()
        .select()
        .eq()
        .single.mockResolvedValueOnce({
          data: mockAttendance,
          error: null,
        })
        .mockResolvedValueOnce({
          data: mockExistingPayment,
          error: null,
        });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(409);
      expect(responseData.success).toBe(false);
      expect(responseData.error.code).toBe("PAYMENT_ALREADY_EXISTS");
    });
  });

  describe("レート制限", () => {
    it("レート制限に達した場合、429エラーを返す", async () => {
      const mockRateLimitResponse = {
        json: () =>
          Promise.resolve({
            success: false,
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "レート制限に達しました。",
            },
          }),
        status: 429,
      };

      (handleRateLimit as jest.Mock).mockResolvedValue(mockRateLimitResponse);

      const requestBody = {
        attendanceId: "att_test_123",
        amount: 1000,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const request = createRequest(requestBody);
      const response = await POST(request);

      expect(response).toBe(mockRateLimitResponse);
    });
  });
});
