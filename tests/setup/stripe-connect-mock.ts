/**
 * Stripe Connect サービスモックセットアップ
 *
 * テスト用のStripe Connectサービスモック設定
 * ベストプラクティス：
 * - テストモードのサービス呼び出しを模倣
 * - カスタマイズ可能なモック関数を提供
 * - テスト間でモック状態をリセット可能
 */

import type { IStripeConnectService } from "@features/stripe-connect/server";
import type {
  CreateExpressAccountResult,
  CreateAccountLinkResult,
  AccountInfo,
  StripeConnectAccount,
} from "@features/stripe-connect";

/**
 * Stripe Connect サービスのモック関数群
 */
export interface MockStripeConnectServiceFns {
  getConnectAccountByUser: jest.Mock<Promise<StripeConnectAccount | null>>;
  getAccountInfo: jest.Mock<Promise<AccountInfo>>;
  updateAccountStatus: jest.Mock<Promise<void>>;
  createAccountLink: jest.Mock<Promise<CreateAccountLinkResult>>;
  createExpressAccount: jest.Mock<Promise<CreateExpressAccountResult>>;
}

/**
 * Stripe Connect サービスのモック生成
 *
 * カスタマイズ可能なオプションパラメータでモック関数を設定
 */
export const createMockStripeConnectService = (options?: {
  getConnectAccountByUser?: StripeConnectAccount | null;
  getAccountInfo?: AccountInfo;
  createAccountLink?: CreateAccountLinkResult;
  createExpressAccount?: CreateExpressAccountResult;
}): IStripeConnectService & { __mockFns: MockStripeConnectServiceFns } => {
  const {
    getConnectAccountByUser = null,
    getAccountInfo = {
      accountId: "acct_test",
      status: "onboarding",
      chargesEnabled: false,
      payoutsEnabled: false,
      stripeAccount: {
        id: "acct_test",
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
        capabilities: {
          card_payments: "inactive",
          transfers: "inactive",
        },
      } as any,
    },
    createAccountLink = {
      url: "https://connect.stripe.com/setup/e/acct_test/session_token",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    },
    createExpressAccount = {
      accountId: "acct_test",
      status: "unverified",
    },
  } = options || {};

  const mockFns: MockStripeConnectServiceFns = {
    getConnectAccountByUser: jest.fn().mockResolvedValue(getConnectAccountByUser),
    getAccountInfo: jest.fn().mockResolvedValue(getAccountInfo),
    updateAccountStatus: jest.fn().mockResolvedValue(undefined),
    createAccountLink: jest.fn().mockResolvedValue(createAccountLink),
    createExpressAccount: jest.fn().mockResolvedValue(createExpressAccount),
  };

  return {
    getConnectAccountByUser: mockFns.getConnectAccountByUser,
    getAccountInfo: mockFns.getAccountInfo,
    updateAccountStatus: mockFns.updateAccountStatus,
    createAccountLink: mockFns.createAccountLink,
    createExpressAccount: mockFns.createExpressAccount,
    // その他のIStripeConnectServiceのメソッド
    updateBusinessProfile: jest.fn().mockResolvedValue({} as any),
    isChargesEnabled: jest.fn().mockResolvedValue(false),
    isPayoutsEnabled: jest.fn().mockResolvedValue(false),
    isAccountReadyForPayout: jest.fn().mockResolvedValue(false),
    isAccountVerified: jest.fn().mockResolvedValue(false),
    createLoginLink: jest.fn().mockResolvedValue({
      url: "https://connect.stripe.com/login/acct_test",
      created: Math.floor(Date.now() / 1000),
    }),
    getAccountBalance: jest.fn().mockResolvedValue(0),
    // __mockFns をエクスポートしてテスト内で参照可能にする
    __mockFns: mockFns,
  } as unknown as IStripeConnectService & { __mockFns: MockStripeConnectServiceFns };
};

/**
 * jest.mock用のモック設定ヘルパー
 *
 * @features/stripe-connect/server モジュールをモックする際に使用
 */
export const setupStripeConnectServiceMock = (options?: {
  getConnectAccountByUser?: StripeConnectAccount | null;
  getAccountInfo?: AccountInfo;
  createAccountLink?: CreateAccountLinkResult;
  createExpressAccount?: CreateExpressAccountResult;
}) => {
  const actual = jest.requireActual("@features/stripe-connect/server");
  const mockService = createMockStripeConnectService(options);

  return {
    ...actual,
    __mockFns: mockService.__mockFns,
    createUserStripeConnectService: jest.fn().mockReturnValue(mockService),
  };
};
