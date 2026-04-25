import { jest } from "@jest/globals";

import { submitFeedback } from "@/app/(public)/(platform)/feedback/actions";
import { FeedbackInputSchema } from "@/app/(public)/(platform)/feedback/useFeedbackForm";
import { expectActionFailure } from "@tests/helpers/assert-result";
import {
  setupCommonMocks,
  setupSupabaseClientMocks,
  type CommonMocks,
} from "@tests/setup/common-mocks";

const originalEnv = process.env;

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@core/auth/auth-utils", () => ({
  getCurrentUserForServerAction: jest.fn(),
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: jest.fn(),
}));

jest.mock("@core/rate-limit", () => {
  const actual = jest.requireActual("@core/rate-limit") as any;
  return {
    ...actual,
    enforceRateLimit: jest.fn(),
    withRateLimit: jest.fn(),
    buildKey: jest.fn(),
    POLICIES: {
      ...actual.POLICIES,
      "feedback.submit": {
        scope: "feedback.submit",
        limit: 5,
        window: "1 m",
        blockMs: 5 * 60 * 1000,
      },
    },
  };
});

jest.mock("@core/utils/ip-detection", () => ({
  getClientIPFromHeaders: jest.fn(),
}));

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("submitFeedback Server Action", () => {
  let mocks: CommonMocks;
  let mockSupabase: ReturnType<typeof setupSupabaseClientMocks>;

  beforeAll(() => {
    mockSupabase = setupSupabaseClientMocks();
    const { createServerActionSupabaseClient } = require("@core/supabase/factory");
    (
      createServerActionSupabaseClient as jest.MockedFunction<
        typeof createServerActionSupabaseClient
      >
    ).mockResolvedValue(mockSupabase as any);

    mocks = setupCommonMocks(
      {
        id: "dummy-user-id",
        email: "dummy@example.com",
      } as any,
      {
        includeLogger: true,
        includeRateLimit: true,
        allowRateLimit: true,
        includeNextHeaders: true,
        customHeaders: { "user-agent": "test-user-agent" },
        includeSupabaseClient: false,
        includeIPDetection: true,
        ipAddress: "127.0.0.1",
      }
    );

    mocks.mockSupabaseClient = mockSupabase;
    mocks.mockBuildKey?.mockReturnValue("RL:feedback.submit:127.0.0.1");
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      RL_HMAC_SECRET: "test-secret-key",
    };

    const { headers } = require("next/headers");
    (headers as jest.MockedFunction<typeof headers>).mockReturnValue(mocks.mockHeaders as any);

    mocks.mockEnforceRateLimit?.mockResolvedValue({ allowed: true });
    mocks.mockBuildKey?.mockReturnValue("RL:feedback.submit:127.0.0.1");

    (mockSupabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn(() => Promise.resolve({ data: null, error: null } as any)),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const validInput = {
    category: "feature_request" as const,
    message: "これはテスト用のフィードバック本文です。10文字以上あります。",
    pageContext: "",
    name: "",
    email: "",
    consent: true,
  };

  test("有効な入力で送信が成功する", async () => {
    const result = await submitFeedback(validInput);

    expect(result).toMatchObject({ success: true });
    expect(result).not.toHaveProperty("error");
  });

  test("任意項目の空文字はnullで保存される", async () => {
    let insertedData: any = null;
    (mockSupabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockImplementation((data) => {
        insertedData = data;
        return Promise.resolve({ data: null, error: null });
      }),
    });

    const result = await submitFeedback(validInput);

    expect(result).toMatchObject({ success: true });
    expect(insertedData).toMatchObject({
      category: "feature_request",
      name: null,
      email: null,
      page_context: null,
      user_agent: "test-user-agent",
    });
  });

  test("入力値をサニタイズして保存する", async () => {
    let insertedData: any = null;
    (mockSupabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockImplementation((data) => {
        insertedData = data;
        return Promise.resolve({ data: null, error: null });
      }),
    });

    const result = await submitFeedback({
      ...validInput,
      message: "<p>HTMLタグを含むフィードバック本文です。これは10文字以上です。</p>",
      pageContext: "<script>alert('x')</script>/events/create",
      name: "<b>山田</b>",
      email: "USER@example.com",
    });

    expect(result).toMatchObject({ success: true });
    expect(insertedData.message).not.toContain("<p>");
    expect(insertedData.page_context).not.toContain("<script>");
    expect(insertedData.name).not.toContain("<b>");
    expect(insertedData.email).toBe("user@example.com");
  });

  test("不正なメールアドレスはバリデーションエラーを返す", async () => {
    const result = await submitFeedback({
      ...validInput,
      email: "invalid-email",
    });

    expect(result).toMatchObject({ success: false });
    expect(expectActionFailure(result).code).toBe("VALIDATION_ERROR");
  });

  test("未知のカテゴリはバリデーションエラーを返す", async () => {
    const result = await submitFeedback({
      ...validInput,
      category: "unknown" as any,
    });

    expect(result).toMatchObject({ success: false });
    expect(expectActionFailure(result).code).toBe("VALIDATION_ERROR");
  });

  test("同日・同内容の重複送信をブロックする", async () => {
    let callCount = 0;
    (mockSupabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ data: null, error: null });
        }

        return Promise.resolve({
          data: null,
          error: {
            code: "23505",
            message: "duplicate key value violates unique constraint",
          },
        });
      }),
    });

    const result1 = await submitFeedback(validInput);
    const result2 = await submitFeedback(validInput);

    expect(result1).toMatchObject({ success: true });
    expect(result2).toMatchObject({ success: false });
    expect(expectActionFailure(result2).code).toBe("RESOURCE_CONFLICT");
  });

  test("レート制限時はRATE_LIMITEDを返す", async () => {
    mocks.mockEnforceRateLimit?.mockResolvedValue({
      allowed: false,
      retryAfter: 60,
    });

    const result = await submitFeedback(validInput);

    expect(result).toMatchObject({ success: false });
    const error = expectActionFailure(result);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.details as any).toHaveProperty("retryAfterSec", 60);
  });

  test("スキーマは想定通りの構造を持つ", () => {
    expect(FeedbackInputSchema.shape).toHaveProperty("category");
    expect(FeedbackInputSchema.shape).toHaveProperty("message");
    expect(FeedbackInputSchema.shape).toHaveProperty("pageContext");
    expect(FeedbackInputSchema.shape).toHaveProperty("name");
    expect(FeedbackInputSchema.shape).toHaveProperty("email");
    expect(FeedbackInputSchema.shape).toHaveProperty("consent");
  });
});
