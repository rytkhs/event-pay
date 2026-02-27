/**
 * 統一モック設定
 *
 * テストコードの重複を削減するための共通モック設定関数群
 * 既にjest-setup.tsでモック化されている関数の設定を共通化
 */

import { NextRequest } from "next/server";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { logger } from "@core/logging/app-logger";
import { buildKey, enforceRateLimit, withRateLimit } from "@core/rate-limit";
import { logSecurityEvent } from "@core/security/security-logger";

import type { TestUser } from "@tests/helpers/test-user";
import { createMockSupabaseClient } from "@tests/setup/supabase-auth-mock";

/**
 * Next.js headersモックの型
 */
export interface MockHeaders {
  get: (name: string) => string | null;
}

/**
 * 環境変数モックの型
 */
export interface MockEnv {
  RL_HMAC_SECRET?: string;
  ADMIN_EMAIL?: string;
  SLACK_CONTACT_WEBHOOK_URL?: string;
  [key: string]: any;
}

/**
 * 共通モック設定のインターフェース
 */
export interface CommonMocks {
  mockGetCurrentUser: jest.MockedFunction<typeof getCurrentUserForServerAction>;
  mockLogger?: jest.Mocked<typeof logger>;
  mockEnforceRateLimit?: jest.MockedFunction<typeof enforceRateLimit>;
  mockWithRateLimit?: jest.MockedFunction<typeof withRateLimit>;
  mockBuildKey?: jest.MockedFunction<typeof buildKey>;
  mockLogSecurityEvent?: jest.MockedFunction<typeof logSecurityEvent>;
  mockHeaders?: MockHeaders;
  mockSupabaseClient?: ReturnType<typeof createMockSupabaseClient>;
  mockGetEnv?: jest.MockedFunction<() => MockEnv>;
  mockGetClientIPFromHeaders?: jest.MockedFunction<() => string>;
  mockEmailService?: {
    sendEmail: jest.MockedFunction<any>;
    sendAdminAlert?: jest.MockedFunction<any>;
  };
  mockSlack?: {
    sendSlackText: jest.MockedFunction<any>;
  };
}

/**
 * 認証モックを設定
 *
 * getCurrentUserForServerActionのモックを設定します。
 * 注意: jest-setup.tsで既にモック化されているため、この関数はモックの値を設定するだけです。
 *
 * @param testUser テストユーザー情報
 * @returns モック関数
 *
 * @example
 * ```typescript
 * const setup = await createCommonTestSetup();
 * const mockGetCurrentUser = setupAuthMocks(setup.testUser);
 *
 * beforeEach(() => {
 *   mockGetCurrentUser.mockResolvedValue({
 *     id: setup.testUser.id,
 *     email: setup.testUser.email,
 *   } as any);
 * });
 * ```
 */
export function setupAuthMocks(testUser: TestUser): jest.MockedFunction<typeof getCurrentUserForServerAction> {
  const mockGetCurrentUser = getCurrentUserForServerAction as jest.MockedFunction<typeof getCurrentUserForServerAction>;
  mockGetCurrentUser.mockResolvedValue({
    id: testUser.id,
    email: testUser.email,
    user_metadata: {},
    app_metadata: {},
  } as any);

  return mockGetCurrentUser;
}

/**
 * ロガーモックを設定
 *
 * @core/logging/app-loggerのロガーモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("@core/logging/app-logger")でモック化されている必要があります。
 *
 * @returns モックされたロガーオブジェクト
 *
 * @example
 * ```typescript
 * jest.mock("@core/logging/app-logger", () => ({
 *   logger: {
 *     info: jest.fn(),
 *     warn: jest.fn(),
 *     error: jest.fn(),
 *     debug: jest.fn(),
 *   },
 * }));
 *
 * const mockLogger = setupLoggerMocks();
 * logger.info("テストメッセージ");
 * expect(mockLogger.info).toHaveBeenCalledWith("テストメッセージ");
 * ```
 */
export function setupLoggerMocks(): jest.Mocked<typeof logger> {
  // jest.mockで既にモック化されている場合、そのまま返す
  // モック化されていない場合は、型アサーションのみで対応
  return logger as jest.Mocked<typeof logger>;
}

/**
 * レート制限モックを設定
 *
 * @core/rate-limitのモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("@core/rate-limit")でモック化されている必要があります。
 *
 * @param allowByDefault デフォルトでレート制限を通すか（デフォルト: true）
 * @param buildKeyReturnValue buildKeyの戻り値（デフォルト: "RL:contact.submit:127.0.0.1"）
 * @returns モック関数のオブジェクト
 *
 * @example
 * ```typescript
 * jest.mock("@core/rate-limit", () => ({
 *   enforceRateLimit: jest.fn(),
 *   withRateLimit: jest.fn(),
 *   buildKey: jest.fn(),
 * }));
 *
 * const mocks = setupRateLimitMocks(true);
 * const result = await enforceRateLimit("test-key");
 * expect(result.allowed).toBe(true);
 * ```
 */
export function setupRateLimitMocks(
  allowByDefault: boolean = true,
  buildKeyReturnValue: string | string[] = "RL:contact.submit:127.0.0.1"
): {
  mockEnforceRateLimit: jest.MockedFunction<typeof enforceRateLimit>;
  mockWithRateLimit: jest.MockedFunction<typeof withRateLimit>;
  mockBuildKey: jest.MockedFunction<typeof buildKey>;
} {
  const mockEnforceRateLimit = enforceRateLimit as jest.MockedFunction<typeof enforceRateLimit>;
  const mockWithRateLimit = withRateLimit as jest.MockedFunction<typeof withRateLimit>;
  const mockBuildKey = buildKey as jest.MockedFunction<typeof buildKey>;

  if (allowByDefault) {
    // デフォルトでレート制限を通す
    mockEnforceRateLimit.mockResolvedValue({ allowed: true });
    mockWithRateLimit.mockImplementation((_policy, _keyBuilder) => {
      return async (_request: NextRequest) => {
        return null; // レート制限なし
      };
    });
  }

  // buildKeyのデフォルト値を設定
  mockBuildKey.mockReturnValue(buildKeyReturnValue);

  return {
    mockEnforceRateLimit,
    mockWithRateLimit,
    mockBuildKey,
  };
}

/**
 * セキュリティログモックを設定
 *
 * @core/security/security-loggerのモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("@core/security/security-logger")でモック化されている必要があります。
 *
 * @returns モック関数
 */
export function setupSecurityLoggerMocks(): jest.MockedFunction<typeof logSecurityEvent> {
  const mockLogSecurityEvent = logSecurityEvent as jest.MockedFunction<typeof logSecurityEvent>;
  // mockImplementationを使用してPromiseを返す
  mockLogSecurityEvent.mockImplementation(async () => {
    return Promise.resolve();
  });

  return mockLogSecurityEvent;
}

/**
 * 共通モックを一括設定
 *
 * よく使われるモック設定を一度に実行します。
 * 必要なモックのみを選択的に有効化できます。
 *
 * @param testUser テストユーザー情報（認証モックに使用）
 * @param options オプション設定
 * @returns モック設定オブジェクト
 *
 * @example
 * 基本的な使用例（複数のモックを一括設定）
 * ```typescript
 * import { setupCommonMocks, resetCommonMocks, type CommonMocks } from "@tests/setup/common-mocks";
 *
 * describe("統合テスト", () => {
 *   let setup: CommonTestSetup;
 *   let mocks: CommonMocks;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup();
 *     mocks = setupCommonMocks(setup.testUser, {
 *       includeLogger: true, // ロガーモックを有効化
 *       includeRateLimit: true, // レート制限モックを有効化
 *       includeNextHeaders: true, // Next.js headersモックを有効化
 *       allowRateLimit: true, // レート制限を許可（デフォルト: true）
 *     });
 *   });
 *
 *   afterEach(() => {
 *     resetCommonMocks(mocks); // モックをリセット
 *   });
 * });
 * ```
 *
 * @example
 * セキュリティログモックを含む場合
 * ```typescript
 * describe("セキュリティテスト", () => {
 *   let setup: CommonTestSetup;
 *   let mocks: CommonMocks;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup();
 *     mocks = setupCommonMocks(setup.testUser, {
 *       includeSecurityLogger: true, // セキュリティログモックを有効化
 *       includeLogger: true,
 *     });
 *   });
 *
 *   test("セキュリティイベントが記録される", async () => {
 *     await performSecurityAction();
 *     expect(mocks.mockLogSecurityEvent).toHaveBeenCalled();
 *   });
 * });
 * ```
 *
 * @example
 * カスタムヘッダーや環境変数を含む場合
 * ```typescript
 * describe("環境変数テスト", () => {
 *   let setup: CommonTestSetup;
 *   let mocks: CommonMocks;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup();
 *     mocks = setupCommonMocks(setup.testUser, {
 *       includeNextHeaders: true,
 *       customHeaders: {
 *         "x-forwarded-for": "192.168.1.1",
 *         "user-agent": "test-agent",
 *       },
 *       includeCloudflareEnv: true,
 *       customEnv: {
 *         RL_HMAC_SECRET: "custom-secret",
 *         ADMIN_EMAIL: "custom-admin@example.com",
 *       },
 *       includeIPDetection: true,
 *       ipAddress: "192.168.1.1",
 *     });
 *   });
 * });
 * ```
 *
 * @example
 * メール通知とSlack通知を含む場合
 * ```typescript
 * describe("通知テスト", () => {
 *   let setup: CommonTestSetup;
 *   let mocks: CommonMocks;
 *
 *   beforeAll(async () => {
 *     setup = await createCommonTestSetup();
 *     mocks = setupCommonMocks(setup.testUser, {
 *       includeEmailService: true,
 *       emailServiceOptions: {
 *         sendEmailSuccess: true,
 *         sendAdminAlertSuccess: true,
 *       },
 *       includeSlack: true,
 *       slackSuccess: true,
 *     });
 *   });
 *
 *   test("メール通知が送信される", async () => {
 *     await sendNotification();
 *     expect(mocks.mockEmailService?.sendEmail).toHaveBeenCalled();
 *   });
 * });
 * ```
 */
export function setupCommonMocks(
  testUser: TestUser,
  options: {
    includeLogger?: boolean;
    includeRateLimit?: boolean;
    includeSecurityLogger?: boolean;
    allowRateLimit?: boolean;
    includeNextHeaders?: boolean;
    customHeaders?: Record<string, string>;
    includeSupabaseClient?: boolean;
    includeCloudflareEnv?: boolean;
    customEnv?: Partial<MockEnv>;
    includeIPDetection?: boolean;
    ipAddress?: string;
    includeEmailService?: boolean;
    emailServiceOptions?: {
      sendEmailSuccess?: boolean;
      sendAdminAlertSuccess?: boolean;
    };
    includeSlack?: boolean;
    slackSuccess?: boolean;
  } = {}
): CommonMocks {
  const {
    includeLogger = false,
    includeRateLimit = false,
    includeSecurityLogger = false,
    allowRateLimit = true,
    includeNextHeaders = false,
    customHeaders,
    includeSupabaseClient = false,
    includeCloudflareEnv = false,
    customEnv,
    includeIPDetection = false,
    ipAddress,
    includeEmailService = false,
    emailServiceOptions,
    includeSlack = false,
    slackSuccess = true,
  } = options;

  const mockGetCurrentUser = setupAuthMocks(testUser);

  const mocks: CommonMocks = {
    mockGetCurrentUser,
  };

  if (includeLogger) {
    mocks.mockLogger = setupLoggerMocks() as jest.Mocked<typeof logger>;
  }

  if (includeRateLimit) {
    const rateLimitMocks = setupRateLimitMocks(allowRateLimit);
    mocks.mockEnforceRateLimit = rateLimitMocks.mockEnforceRateLimit;
    mocks.mockWithRateLimit = rateLimitMocks.mockWithRateLimit;
    mocks.mockBuildKey = rateLimitMocks.mockBuildKey;
  }

  if (includeSecurityLogger) {
    mocks.mockLogSecurityEvent = setupSecurityLoggerMocks();
  }

  if (includeNextHeaders) {
    mocks.mockHeaders = setupNextHeadersMocks(customHeaders);
  }

  if (includeSupabaseClient) {
    mocks.mockSupabaseClient = setupSupabaseClientMocks();
  }

  if (includeCloudflareEnv) {
    mocks.mockGetEnv = setupCloudflareEnvMocks(customEnv);
  }

  if (includeIPDetection) {
    mocks.mockGetClientIPFromHeaders = setupIPDetectionMocks(ipAddress);
  }

  if (includeEmailService) {
    mocks.mockEmailService = setupEmailServiceMocks(emailServiceOptions);
  }

  if (includeSlack) {
    mocks.mockSlack = setupSlackMocks(slackSuccess);
  }

  return mocks;
}

/**
 * Next.js headersモックを設定
 *
 * next/headersのモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("next/headers")でモック化されている必要があります。
 *
 * @param customHeaders カスタムヘッダー（オプション）
 * @returns モックされたheadersオブジェクト
 *
 * @example
 * ```typescript
 * jest.mock("next/headers", () => ({
 *   headers: jest.fn(),
 * }));
 *
 * const mockHeaders = setupNextHeadersMocks({
 *   "user-agent": "test-user-agent",
 *   "x-forwarded-for": "127.0.0.1",
 * });
 * ```
 */
export function setupNextHeadersMocks(customHeaders: Record<string, string> = {}): MockHeaders {
  const defaultHeaders: Record<string, string> = {
    "user-agent": "test-user-agent",
    ...customHeaders,
  };

  const mockHeaders: MockHeaders = {
    get: (name: string) => {
      return defaultHeaders[name.toLowerCase()] || null;
    },
  };

  return mockHeaders;
}

/**
 * Supabaseクライアントモックを設定
 *
 * @core/supabase/serverのモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("@core/supabase/server")でモック化されている必要があります。
 *
 * @param options モックオプション（オプション）
 * @returns モックされたSupabaseクライアント
 *
 * @example
 * ```typescript
 * jest.mock("@core/supabase/server", () => ({
 *   createClient: jest.fn(),
 * }));
 *
 * const mockSupabase = setupSupabaseClientMocks();
 * ```
 */
export function setupSupabaseClientMocks(): ReturnType<typeof createMockSupabaseClient> {
  return createMockSupabaseClient();
}

/**
 * 環境変数モックを設定
 *
 * @core/utils/cloudflare-envのモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("@core/utils/cloudflare-env")でモック化されている必要があります。
 *
 * @param customEnv カスタム環境変数（オプション）
 * @returns モック関数
 *
 * @example
 * ```typescript
 * jest.mock("@core/utils/cloudflare-env", () => ({
 *   getEnv: jest.fn(),
 * }));
 *
 * const mockGetEnv = setupCloudflareEnvMocks({
 *   RL_HMAC_SECRET: "custom-secret",
 *   ADMIN_EMAIL: "custom-admin@example.com",
 * });
 * ```
 */
export function setupCloudflareEnvMocks(
  customEnv: Partial<MockEnv> = {}
): jest.MockedFunction<() => MockEnv> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getEnv } = require("@core/utils/cloudflare-env");
  const mockGetEnv = getEnv as jest.MockedFunction<() => MockEnv>;

  const defaultEnv: MockEnv = {
    RL_HMAC_SECRET: "test-secret-key",
    ADMIN_EMAIL: "admin@example.com",
    SLACK_CONTACT_WEBHOOK_URL: undefined,
    ...customEnv,
  };

  mockGetEnv.mockReturnValue(defaultEnv);

  return mockGetEnv;
}

/**
 * IP検出モックを設定
 *
 * @core/utils/ip-detectionのモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("@core/utils/ip-detection")でモック化されている必要があります。
 *
 * @param ip IPアドレス（デフォルト: "127.0.0.1"）
 * @returns モック関数
 *
 * @example
 * ```typescript
 * jest.mock("@core/utils/ip-detection", () => ({
 *   getClientIPFromHeaders: jest.fn(),
 * }));
 *
 * const mockGetClientIPFromHeaders = setupIPDetectionMocks("192.168.1.1");
 * ```
 */
export function setupIPDetectionMocks(ip: string = "127.0.0.1"): jest.MockedFunction<() => string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getClientIPFromHeaders } = require("@core/utils/ip-detection");
  const mockGetClientIPFromHeaders = getClientIPFromHeaders as jest.MockedFunction<() => string>;

  mockGetClientIPFromHeaders.mockReturnValue(ip);

  return mockGetClientIPFromHeaders;
}

/**
 * メール通知サービスモックを設定
 *
 * @core/notification/email-serviceのモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("@core/notification/email-service")でモック化されている必要があります。
 *
 * @param options モックオプション（オプション）
 * @returns モックされたメール通知サービス
 *
 * @example
 * ```typescript
 * jest.mock("@core/notification/email-service", () => ({
 *   EmailNotificationService: jest.fn(),
 * }));
 *
 * const mockEmailService = setupEmailServiceMocks();
 * ```
 */
export function setupEmailServiceMocks(
  options: {
    sendEmailSuccess?: boolean;
    sendAdminAlertSuccess?: boolean;
  } = {}
): {
  sendEmail: jest.MockedFunction<any>;
  sendAdminAlert?: jest.MockedFunction<any>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EmailNotificationService } = require("@core/notification/email-service");
  const MockEmailService = EmailNotificationService as jest.MockedClass<any>;

  const { sendEmailSuccess = true, sendAdminAlertSuccess = true } = options;

  const mockSendEmail = jest.fn().mockResolvedValue({
    success: sendEmailSuccess,
    messageId: sendEmailSuccess ? "test-message-id" : undefined,
    retryCount: 0,
  });

  const mockSendAdminAlert = jest.fn().mockResolvedValue({
    success: sendAdminAlertSuccess,
    messageId: sendAdminAlertSuccess ? "test-admin-alert-id" : undefined,
    retryCount: 0,
  });

  MockEmailService.mockImplementation(() => ({
    sendEmail: mockSendEmail,
    sendAdminAlert: mockSendAdminAlert,
  }));

  return {
    sendEmail: mockSendEmail,
    sendAdminAlert: mockSendAdminAlert,
  };
}

/**
 * Slack通知モックを設定
 *
 * @core/notification/slackのモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("@core/notification/slack")でモック化されている必要があります。
 *
 * @param success 成功レスポンスを返すか（デフォルト: true）
 * @returns モック関数
 *
 * @example
 * ```typescript
 * jest.mock("@core/notification/slack", () => ({
 *   sendSlackText: jest.fn(),
 * }));
 *
 * const mockSendSlackText = setupSlackMocks(true);
 * ```
 */
export function setupSlackMocks(success: boolean = true): {
  sendSlackText: jest.MockedFunction<any>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sendSlackText } = require("@core/notification/slack");
  const mockSendSlackText = sendSlackText as jest.MockedFunction<any>;

  mockSendSlackText.mockResolvedValue({
    success,
    ...(success ? { messageId: "test-slack-message-id" } : { error: "Slack送信失敗" }),
  });

  return {
    sendSlackText: mockSendSlackText,
  };
}

/**
 * Next.js cacheモックを設定
 *
 * next/cacheのモックを設定します。
 * 注意: この関数を呼び出す前に、jest.mock("next/cache")でモック化されている必要があります。
 *
 * @returns モック関数
 *
 * @example
 * ```typescript
 * jest.mock("next/cache", () => ({
 *   revalidatePath: jest.fn(),
 * }));
 *
 * const mockRevalidatePath = setupNextCacheMocks();
 * ```
 */
export function setupNextCacheMocks(): {
  revalidatePath: jest.MockedFunction<any>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { revalidatePath } = require("next/cache");
  const mockRevalidatePath = revalidatePath as jest.MockedFunction<any>;

  // デフォルトでは何もしない（voidを返す）
  mockRevalidatePath.mockReturnValue(undefined);

  return {
    revalidatePath: mockRevalidatePath,
  };
}

/**
 * 共通モックをリセット
 *
 * 各テスト後にモックをリセットするために使用します。
 *
 * @param mocks リセットするモックオブジェクト
 */
export function resetCommonMocks(mocks: CommonMocks): void {
  mocks.mockGetCurrentUser.mockReset();

  if (mocks.mockLogger) {
    mocks.mockLogger.info.mockReset();
    mocks.mockLogger.warn.mockReset();
    mocks.mockLogger.error.mockReset();
    mocks.mockLogger.debug.mockReset();
  }

  if (mocks.mockEnforceRateLimit) {
    mocks.mockEnforceRateLimit.mockReset();
  }

  if (mocks.mockWithRateLimit) {
    mocks.mockWithRateLimit.mockReset();
  }

  if (mocks.mockBuildKey) {
    mocks.mockBuildKey.mockReset();
  }

  if (mocks.mockLogSecurityEvent) {
    mocks.mockLogSecurityEvent.mockReset();
  }

  if (mocks.mockGetEnv) {
    mocks.mockGetEnv.mockReset();
  }

  if (mocks.mockGetClientIPFromHeaders) {
    mocks.mockGetClientIPFromHeaders.mockReset();
  }

  if (mocks.mockEmailService) {
    mocks.mockEmailService.sendEmail.mockReset();
    if (mocks.mockEmailService.sendAdminAlert) {
      mocks.mockEmailService.sendAdminAlert.mockReset();
    }
  }

  if (mocks.mockSlack) {
    mocks.mockSlack.sendSlackText.mockReset();
  }
}
