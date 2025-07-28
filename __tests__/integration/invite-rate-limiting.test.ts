/**
 * @jest-environment node
 */
import { GET } from "@/app/api/invite/[token]/route";
import { NextRequest, NextResponse } from "next/server";
import { generateInviteToken } from "@/lib/utils/invite-token";

// レート制限をモックして、レート制限超過をシミュレートする
jest.mock("@/lib/rate-limit-middleware", () => ({
  handleRateLimit: jest.fn(),
}));

// Supabaseをモック
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: "Not found" },
          }),
        }),
      }),
    }),
  })),
}));

import { handleRateLimit } from "@/lib/rate-limit-middleware";

const mockHandleRateLimit = handleRateLimit as jest.MockedFunction<typeof handleRateLimit>;

describe("招待APIのレート制限", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("制限を超えた場合、レート制限エラーを返すこと", async () => {
    const validToken = generateInviteToken();
    const request = new NextRequest(`http://localhost:3000/api/invite/${validToken}`);

    // レート制限超過レスポンスをモック
    const rateLimitResponse = new NextResponse(
      JSON.stringify({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "レート制限に達しました。しばらく待ってから再試行してください。",
          retryAfter: 60,
        },
      }),
      {
        status: 429,
        headers: {
          "Retry-After": "60",
        },
      }
    );

    mockHandleRateLimit.mockResolvedValue(rateLimitResponse);

    const response = await GET(request, { params: { token: validToken } });
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("レート制限に達していない場合、正常に処理を続行すること", async () => {
    const validToken = generateInviteToken();
    const request = new NextRequest(`http://localhost:3000/api/invite/${validToken}`);

    // レート制限に達していない場合をモック (nullを返す)
    mockHandleRateLimit.mockResolvedValue(null);

    const response = await GET(request, { params: { token: validToken } });

    // 通常の処理に進むはず (モックされたSupabaseにより404が返る)
    expect(response.status).toBe(404);
    expect(mockHandleRateLimit).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        windowMs: 5 * 60 * 1000, // 5分
        maxAttempts: 10,
        blockDurationMs: 15 * 60 * 1000, // 15分
      }),
      "invite"
    );
  });
});
