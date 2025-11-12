/**
 * Guest Session Creation テスト共通セットアップ
 *
 * 共通セットアップ関数を使用してリファクタリング済み
 */

import { jest } from "@jest/globals";

import { enforceRateLimit, buildKey } from "../../../../core/rate-limit";
import { SecureSupabaseClientFactory } from "../../../../core/security/secure-client-factory.impl";
import * as DestinationCharges from "../../../../core/stripe/destination-charges";
import { validateGuestToken } from "../../../../core/utils/guest-token";
import { canCreateStripeSession } from "../../../../core/validation/payment-eligibility";
import { ApplicationFeeCalculator } from "../../../../features/payments/services/fee-config/application-fee-calculator";
import {
  createTestUserWithConnect,
  createPaidTestEvent,
  createTestAttendance,
  cleanupTestPaymentData,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "../../../helpers/test-payment-data";
import { setupRateLimitMocks } from "../../../setup/common-mocks";

// モック設定
jest.mock("../../../../core/utils/guest-token");
jest.mock("../../../../core/validation/payment-eligibility");
jest.mock("../../../../core/rate-limit");
jest.mock("../../../../core/stripe/destination-charges");
jest.mock("../../../../features/payments/services/fee-config/application-fee-calculator");
jest.mock("../../../../features/payments/core-bindings");

export interface GuestSessionCreationTestContext {
  testUser: TestPaymentUser;
  testEvent: TestPaymentEvent;
  testAttendance: TestAttendanceData;
  mockValidateGuestToken: jest.MockedFunction<typeof validateGuestToken>;
  mockCanCreateStripeSession: jest.MockedFunction<typeof canCreateStripeSession>;
  mockEnforceRateLimit: jest.MockedFunction<typeof enforceRateLimit>;
  mockBuildKey: jest.MockedFunction<typeof buildKey>;
  mockCreateDestinationCheckoutSession: jest.MockedFunction<
    typeof DestinationCharges.createDestinationCheckoutSession
  >;
  mockCreateOrRetrieveCustomer: jest.MockedFunction<
    typeof DestinationCharges.createOrRetrieveCustomer
  >;
  mockApplicationFeeCalculator: jest.Mocked<ApplicationFeeCalculator>;
  mockSupabaseClient: any;
}

export async function setupGuestSessionCreationTest(): Promise<GuestSessionCreationTestContext> {
  // テストデータセットアップ
  const testUser = await createTestUserWithConnect(
    `test-organizer-${Date.now()}@example.com`,
    "TestPassword123!",
    {
      stripeAccountId: "acct_test123456789", // 仕様書通りのアカウントID
      payoutsEnabled: true,
      chargesEnabled: true,
    }
  );

  const testEvent = await createPaidTestEvent(testUser.id, {
    fee: 1000, // 仕様書通りの金額
    title: "テストイベント", // 仕様書通りのタイトル
  });

  const testAttendance = await createTestAttendance(testEvent.id, {
    email: "test-guest@example.com", // 仕様書通りのメールアドレス
    nickname: "テストゲスト", // 仕様書通りのニックネーム
    status: "attending",
    // 実際に生成された36文字トークンを使用（仕様書の固定値は使わない）
  });

  // 共通モック設定を使用（レート制限）
  const rateLimitMocks = setupRateLimitMocks(true);

  return {
    testUser,
    testEvent,
    testAttendance,
    mockValidateGuestToken: validateGuestToken as jest.MockedFunction<typeof validateGuestToken>,
    mockCanCreateStripeSession: canCreateStripeSession as jest.MockedFunction<
      typeof canCreateStripeSession
    >,
    mockEnforceRateLimit: rateLimitMocks.mockEnforceRateLimit as any as jest.MockedFunction<
      typeof enforceRateLimit
    >,
    mockBuildKey: rateLimitMocks.mockBuildKey as any as jest.MockedFunction<typeof buildKey>,
    mockCreateDestinationCheckoutSession:
      DestinationCharges.createDestinationCheckoutSession as jest.MockedFunction<
        typeof DestinationCharges.createDestinationCheckoutSession
      >,
    mockCreateOrRetrieveCustomer:
      DestinationCharges.createOrRetrieveCustomer as jest.MockedFunction<
        typeof DestinationCharges.createOrRetrieveCustomer
      >,
    mockApplicationFeeCalculator: {
      calculateApplicationFee: jest.fn(),
    } as any,
    mockSupabaseClient: {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockReturnThis(),
    },
  };
}

export function setupBeforeEach(context: GuestSessionCreationTestContext): void {
  // ApplicationFeeCalculatorのモック
  (
    ApplicationFeeCalculator as jest.MockedClass<typeof ApplicationFeeCalculator>
  ).mockImplementation(() => context.mockApplicationFeeCalculator);

  // SecureSupabaseClientFactory のモック
  jest.spyOn(SecureSupabaseClientFactory, "create").mockReturnValue({
    createGuestClient: jest.fn().mockReturnValue(context.mockSupabaseClient),
  } as any);
}

export async function cleanupAfterAll(context: GuestSessionCreationTestContext): Promise<void> {
  // テストデータクリーンアップ
  await cleanupTestPaymentData({
    attendanceIds: [context.testAttendance.id],
    eventIds: [context.testEvent.id],
    userIds: [context.testUser.id],
  });
}
