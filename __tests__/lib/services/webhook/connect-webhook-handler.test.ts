/**
 * Connect Webhook Handler のテスト
 */

import { ConnectWebhookHandler } from '@/lib/services/webhook/connect-webhook-handler';
import { createStripeConnectServiceWithClient } from '@/lib/services/stripe-connect';
import { NotificationService } from '@/lib/services/notification';
import { SecureSupabaseClientFactory } from '@/lib/security/secure-client-factory.impl';
import type Stripe from 'stripe';

// モック
jest.mock('@/lib/services/stripe-connect');
jest.mock('@/lib/services/notification');
jest.mock('@/lib/security/secure-client-factory.impl');

const mockCreateStripeConnectServiceWithClient = createStripeConnectServiceWithClient as jest.MockedFunction<typeof createStripeConnectServiceWithClient>;
const mockNotificationService = NotificationService as jest.MockedClass<typeof NotificationService>;
const mockSecureSupabaseClientFactory = SecureSupabaseClientFactory as jest.MockedClass<typeof SecureSupabaseClientFactory>;

describe('ConnectWebhookHandler', () => {
  let handler: ConnectWebhookHandler;
  let mockStripeConnectService: any;
  let mockNotificationServiceInstance: any;

  const mockAccount: Stripe.Account = {
    id: 'acct_test_123',
    object: 'account',
    business_profile: null,
    business_type: 'individual',
    capabilities: {
      card_payments: 'active',
      transfers: 'active'
    },
    charges_enabled: true,
    country: 'JP',
    created: 1234567890,
    default_currency: 'jpy',
    details_submitted: true,
    email: 'test@example.com',
    external_accounts: {
      object: 'list',
      data: [],
      has_more: false,
      url: '/v1/accounts/acct_test_123/external_accounts'
    },
    metadata: {
      user_id: 'user_test_123'
    },
    payouts_enabled: true,
    requirements: {
      alternatives: [],
      currently_due: [],
      disabled_reason: null,
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
      current_deadline: null
    },
    settings: {
      branding: {
        icon: null,
        logo: null,
        primary_color: null,
        secondary_color: null
      },
      card_payments: {
        decline_on: {
          avs_failure: false,
          cvc_failure: false
        },
        statement_descriptor_prefix: null,
        statement_descriptor_prefix_kana: null,
        statement_descriptor_prefix_kanji: null
      },
      dashboard: {
        display_name: null,
        timezone: 'Asia/Tokyo'
      },
      payments: {
        statement_descriptor: null,
        statement_descriptor_kana: null,
        statement_descriptor_kanji: null,
        statement_descriptor_prefix_kana: null,
        statement_descriptor_prefix_kanji: null
      },
      payouts: {
        debit_negative_balances: false,
        schedule: {
          delay_days: 2,
          interval: 'daily'
        },
        statement_descriptor: null
      }
    },
    type: 'express',
    tos_acceptance: {
      date: 1234567890,
      ip: '127.0.0.1',
      user_agent: 'test-agent'
    }
  };

  beforeEach(async () => {
    // StripeConnectServiceのモック
    mockStripeConnectService = {
      getConnectAccountByUser: jest.fn(),
      getAccountInfo: jest.fn(),
      updateAccountStatus: jest.fn()
    };
    mockCreateStripeConnectServiceWithClient.mockReturnValue(mockStripeConnectService as any);

    // NotificationServiceのモック
    mockNotificationServiceInstance = {
      sendAccountVerifiedNotification: jest.fn().mockResolvedValue({ success: true }),
      sendAccountRestrictedNotification: jest.fn().mockResolvedValue({ success: true }),
      sendAccountStatusChangeNotification: jest.fn().mockResolvedValue({ success: true })
    };
    mockNotificationService.mockImplementation(() => mockNotificationServiceInstance);

    // SecureSupabaseClientFactoryのモック設定
    const mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null })
    };

    const mockSecureFactoryInstance = {
      createAuditedAdminClient: jest.fn().mockResolvedValue(mockSupabaseClient)
    };

    mockSecureSupabaseClientFactory.getInstance = jest.fn().mockReturnValue(mockSecureFactoryInstance);

    handler = await ConnectWebhookHandler.create();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleAccountUpdated', () => {
    it('アカウント情報を正常に更新する', async () => {
      // モックの設定
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        id: 'connect_test_123',
        user_id: 'user_test_123',
        stripe_account_id: 'acct_test_123',
        status: 'onboarding',
        charges_enabled: false,
        payouts_enabled: false
      });

      mockStripeConnectService.getAccountInfo.mockResolvedValue({
        accountId: 'acct_test_123',
        status: 'verified',
        chargesEnabled: true,
        payoutsEnabled: true,
        email: 'test@example.com',
        country: 'JP'
      });

      // テスト実行
      await handler.handleAccountUpdated(mockAccount);

      // 検証
      expect(mockStripeConnectService.getConnectAccountByUser).toHaveBeenCalledWith('user_test_123');
      expect(mockStripeConnectService.getAccountInfo).toHaveBeenCalledWith('acct_test_123');
      expect(mockStripeConnectService.updateAccountStatus).toHaveBeenCalledWith({
        userId: 'user_test_123',
        status: 'verified',
        chargesEnabled: true,
        payoutsEnabled: true,
        stripeAccountId: 'acct_test_123'
      });
    });

    it('アカウント認証完了時に通知を送信する', async () => {
      // モックの設定（未認証 → 認証済み）
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        id: 'connect_test_123',
        user_id: 'user_test_123',
        stripe_account_id: 'acct_test_123',
        status: 'unverified',
        charges_enabled: false,
        payouts_enabled: false
      });

      mockStripeConnectService.getAccountInfo.mockResolvedValue({
        accountId: 'acct_test_123',
        status: 'verified',
        chargesEnabled: true,
        payoutsEnabled: true,
        email: 'test@example.com',
        country: 'JP'
      });

      // テスト実行
      await handler.handleAccountUpdated(mockAccount);

      // 検証
      expect(mockNotificationServiceInstance.sendAccountVerifiedNotification).toHaveBeenCalledWith({
        userId: 'user_test_123',
        accountId: 'acct_test_123'
      });
    });

    it('アカウント制限時に通知を送信する', async () => {
      // 制限されたアカウントのモック
      const restrictedAccount = {
        ...mockAccount,
        charges_enabled: false,
        payouts_enabled: false,
        requirements: {
          ...mockAccount.requirements,
          disabled_reason: 'requirements.past_due',
          currently_due: ['individual.id_number'],
          past_due: ['individual.verification.document']
        }
      };

      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        id: 'connect_test_123',
        user_id: 'user_test_123',
        stripe_account_id: 'acct_test_123',
        status: 'verified',
        charges_enabled: true,
        payouts_enabled: true
      });

      mockStripeConnectService.getAccountInfo.mockResolvedValue({
        accountId: 'acct_test_123',
        status: 'restricted',
        chargesEnabled: false,
        payoutsEnabled: false,
        requirements: {
          disabled_reason: 'requirements.past_due',
          currently_due: ['individual.id_number'],
          past_due: ['individual.verification.document'],
          eventually_due: [],
          pending_verification: []
        }
      });

      // テスト実行
      await handler.handleAccountUpdated(restrictedAccount as Stripe.Account);

      // 検証
      expect(mockNotificationServiceInstance.sendAccountRestrictedNotification).toHaveBeenCalledWith({
        userId: 'user_test_123',
        accountId: 'acct_test_123',
        restrictionReason: '必要な情報の提出期限が過ぎています',
        requiredActions: [
          '現在必要な情報を提出してください',
          '個人番号（マイナンバー）を提出してください',
          '期限切れの情報を更新してください'
        ],
        dashboardUrl: 'https://dashboard.stripe.com/connect/accounts/acct_test_123'
      });
    });

    it('メタデータにuser_idがない場合は処理をスキップする', async () => {
      const accountWithoutUserId = {
        ...mockAccount,
        metadata: {}
      };

      // テスト実行
      await handler.handleAccountUpdated(accountWithoutUserId as Stripe.Account);

      // 検証
      expect(mockStripeConnectService.getConnectAccountByUser).not.toHaveBeenCalled();
      expect(mockStripeConnectService.updateAccountStatus).not.toHaveBeenCalled();
    });

    it('Connect Accountが見つからない場合でもDBに追従作成して更新する', async () => {
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(null);
      mockStripeConnectService.getAccountInfo.mockResolvedValue({
        accountId: 'acct_test_123',
        status: 'verified',
        chargesEnabled: true,
        payoutsEnabled: true,
        email: 'test@example.com',
        country: 'JP'
      });

      await handler.handleAccountUpdated(mockAccount);

      expect(mockStripeConnectService.getConnectAccountByUser).toHaveBeenCalledWith('user_test_123');
      expect(mockStripeConnectService.getAccountInfo).toHaveBeenCalledWith('acct_test_123');
      expect(mockStripeConnectService.updateAccountStatus).toHaveBeenCalledWith({
        userId: 'user_test_123',
        status: 'verified',
        chargesEnabled: true,
        payoutsEnabled: true,
        stripeAccountId: 'acct_test_123'
      });
    });

    it('エラーが発生した場合は適切にハンドリングする', async () => {
      const error = new Error('Database connection failed');
      mockStripeConnectService.getConnectAccountByUser.mockRejectedValue(error);

      // テスト実行とエラー検証
      await expect(handler.handleAccountUpdated(mockAccount)).rejects.toThrow('Database connection failed');

      // エラー通知が送信されることを確認
      expect(mockNotificationServiceInstance.sendAccountStatusChangeNotification).toHaveBeenCalledWith({
        userId: 'user_test_123',
        accountId: 'acct_test_123',
        oldStatus: 'unknown',
        newStatus: 'error',
        chargesEnabled: false,
        payoutsEnabled: false
      });
    });
  });
});
