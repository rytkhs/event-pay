import { jest } from "@jest/globals";

import {
  setupCommonMocks,
  setupSupabaseClientMocks,
  type CommonMocks,
} from "@tests/setup/common-mocks";
import { expectActionFailure } from "@tests/helpers/assert-result";

import { submitCommunityContact } from "@/app/(public)/c/[slug]/contact/actions";

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
    buildKey: jest.fn(),
    withRateLimit: jest.fn(),
    POLICIES: {
      ...actual.POLICIES,
      "community.contact.submit": {
        scope: "community.contact.submit",
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

jest.mock("@core/utils/cloudflare-ctx", () => ({
  waitUntil: jest.fn((promise: Promise<unknown>) => promise),
}));

jest.mock("@core/security/secure-client-factory.impl", () => ({
  createAuditedAdminClient: jest.fn(),
}));

jest.mock("@core/notification/email-service", () => ({
  EmailNotificationService: jest.fn(),
}));

jest.mock("@core/notification/slack", () => ({
  sendSlackText: jest.fn(),
}));

describe("submitCommunityContact Server Action - 統合テスト", () => {
  let mocks: CommonMocks;
  let mockSupabase: ReturnType<typeof setupSupabaseClientMocks>;
  let mockAdminClient: any;

  beforeAll(() => {
    mockSupabase = setupSupabaseClientMocks();
    const { createServerActionSupabaseClient } = require("@core/supabase/factory");
    (
      createServerActionSupabaseClient as jest.MockedFunction<
        typeof createServerActionSupabaseClient
      >
    ).mockResolvedValue(mockSupabase as any);

    const dummyUser = {
      id: "dummy-user-id",
      email: "dummy@example.com",
    } as any;

    mocks = setupCommonMocks(dummyUser, {
      includeLogger: true,
      includeRateLimit: true,
      allowRateLimit: true,
      includeNextHeaders: true,
      customHeaders: { "user-agent": "test-user-agent" },
      includeSupabaseClient: false,
      includeIPDetection: true,
      ipAddress: "127.0.0.1",
      includeEmailService: true,
      emailServiceOptions: { sendEmailSuccess: true },
      includeSlack: true,
      slackSuccess: true,
    });

    mockAdminClient = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { created_by: "owner-user-id" },
              error: null,
            }),
          })),
        })),
      })),
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({
            data: {
              user: {
                email: "owner@example.com",
              },
            },
            error: null,
          }),
        },
      },
    };

    const { createAuditedAdminClient } = require("@core/security/secure-client-factory.impl");
    (createAuditedAdminClient as jest.Mock).mockResolvedValue(mockAdminClient);
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      RL_HMAC_SECRET: "test-secret-key",
      SLACK_CONTACT_WEBHOOK_URL: "",
    };

    const { headers } = require("next/headers");
    (headers as jest.MockedFunction<typeof headers>).mockReturnValue(mocks.mockHeaders as any);

    mocks.mockEnforceRateLimit!.mockResolvedValue({ allowed: true });
    mocks.mockBuildKey!.mockReturnValue("RL:community.contact.submit:127.0.0.1");

    const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "community_contacts") {
        return { insert: mockInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    (mockSupabase.rpc as jest.Mock).mockImplementation((fn: string, args: any) => {
      if (fn === "rpc_public_get_community_by_slug" && args.p_slug === "community-slug") {
        return Promise.resolve({
          data: [
            {
              id: "community-id",
              name: "Community Name",
              description: "desc",
              slug: "community-slug",
              legal_slug: "legal-slug",
            },
          ],
          error: null,
        });
      }

      return Promise.resolve({ data: [], error: null });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("有効な入力で送信が成功し、owner 通知をスケジュールする", async () => {
    const { EmailNotificationService } = require("@core/notification/email-service");
    const sendEmail = jest.fn().mockResolvedValue({ success: true });
    (EmailNotificationService as jest.Mock).mockImplementation(() => ({
      sendEmail,
    }));

    const result = await submitCommunityContact("community-slug", {
      name: "山田 太郎",
      email: "test@example.com",
      message: "これはコミュニティ向けのお問い合わせ本文です。10文字以上あります。",
      consent: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toMatchObject({ success: true });
    expect(mockSupabase.rpc).toHaveBeenCalledWith("rpc_public_get_community_by_slug", {
      p_slug: "community-slug",
    });
    expect(mockSupabase.from).toHaveBeenCalledWith("community_contacts");
    expect(sendEmail).toHaveBeenCalled();
  });

  test("存在しない community slug は NOT_FOUND を返す", async () => {
    (mockSupabase.rpc as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await submitCommunityContact("missing-community", {
      name: "山田 太郎",
      email: "test@example.com",
      message: "これはコミュニティ向けのお問い合わせ本文です。10文字以上あります。",
      consent: true,
    });

    expect(result).toMatchObject({ success: false });
    expect(expectActionFailure(result).code).toBe("NOT_FOUND");
  });

  test("重複送信は RESOURCE_CONFLICT を返す", async () => {
    (mockSupabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockResolvedValue({
        data: null,
        error: { code: "23505" },
      }),
    });

    const result = await submitCommunityContact("community-slug", {
      name: "山田 太郎",
      email: "test@example.com",
      message: "これはコミュニティ向けのお問い合わせ本文です。10文字以上あります。",
      consent: true,
    });

    expect(result).toMatchObject({ success: false });
    expect(expectActionFailure(result).code).toBe("RESOURCE_CONFLICT");
  });

  test("レート制限時は RATE_LIMITED を返す", async () => {
    mocks.mockEnforceRateLimit!.mockResolvedValue({
      allowed: false,
      retryAfter: 120,
    });

    const result = await submitCommunityContact("community-slug", {
      name: "山田 太郎",
      email: "test@example.com",
      message: "これはコミュニティ向けのお問い合わせ本文です。10文字以上あります。",
      consent: true,
    });

    expect(result).toMatchObject({ success: false });
    expect(expectActionFailure(result).code).toBe("RATE_LIMITED");
  });
});
