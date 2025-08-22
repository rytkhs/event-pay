/**
 * 手動送金Server Actionのテスト
 */

import { processManualPayoutAction } from "@/app/payouts/actions/process-manual-payout";
import { PayoutService, PayoutValidator, PayoutErrorHandler } from "@/lib/services/payout";
import { StripeConnectService } from "@/lib/services/stripe-connect";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createRateLimitStore, checkRateLimit } from "@/lib/rate-limit";
import { ERROR_CODES } from "@/lib/types/server-actions";
import { AdminReason } from "@/lib/security/secure-client-factory.types";

// モック設定
jest.mock("@/lib/supabase/server");
jest.mock("@supabase/supabase-js");
jest.mock("@/lib/services/payout");
jest.mock("@/lib/services/stripe-connect");
jest.mock("@/lib/rate-limit");
jest.mock("@/lib/security/secure-client-factory.impl", () => {
  const createAuditedAdminClient = jest.fn();
  const instance = { createAuditedAdminClient };
  return {
    SecureSupabaseClientFactory: {
      getInstance: jest.fn(() => instance),
    },
  };
});

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;
const mockCreateRateLimitStore = createRateLimitStore as jest.MockedFunction<typeof createRateLimitStore>;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

const mockPayoutService = PayoutService as jest.MockedClass<typeof PayoutService>;
const mockPayoutValidator = PayoutValidator as jest.MockedClass<typeof PayoutValidator>;
const mockPayoutErrorHandler = PayoutErrorHandler as jest.MockedClass<typeof PayoutErrorHandler>;
const mockStripeConnectService = StripeConnectService as jest.MockedClass<typeof StripeConnectService>;

describe("processManualPayoutAction", () => {
  const mockUser = {
    id: "user-123",
    email: "test@example.com",
  };

  const mockEventId = "550e8400-e29b-41d4-a716-446655440000";

  let mockSupabaseClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Supabaseクライアントのモック
    mockSupabaseClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      },
    };

    mockCreateServerClient.mockReturnValue(mockSupabaseClient);

    // レート制限のモック
    mockCreateRateLimitStore.mockResolvedValue({} as any);
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      resetTime: Date.now() + 60000,
    } as any);

    // 既存モックの初期化（未使用だが依存解決のため）
    mockPayoutService.mockImplementation(() => ({} as any));
    mockPayoutValidator.mockImplementation(() => ({} as any));
    mockPayoutErrorHandler.mockImplementation(
      () => ({
        handlePayoutError: jest.fn(),
        logError: jest.fn(),
      } as unknown as PayoutErrorHandler)
    );
    mockStripeConnectService.mockImplementation((..._args: any[]) => ({} as any));
  });

  it("常にBUSINESS_RULE_VIOLATIONで拒否される", async () => {
    const result = await processManualPayoutAction({
      eventId: mockEventId,
      notes: "緊急送金",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ERROR_CODES.BUSINESS_RULE_VIOLATION);
      expect(result.error).toMatch(/手動送金機能は無効化されています/);
    }
  });

  it("未認証ユーザーでも先に機能無効で拒否される", async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await processManualPayoutAction({ eventId: mockEventId });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ERROR_CODES.BUSINESS_RULE_VIOLATION);
    }
  });
});
