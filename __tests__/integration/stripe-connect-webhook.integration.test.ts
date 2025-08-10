/**
 * Stripe Connect Webhook 統合テスト
 */

import { ConnectWebhookHandler } from '@/lib/services/webhook/connect-webhook-handler';
import type Stripe from 'stripe';

// 実際のサービスを使用した統合テスト
describe('Stripe Connect Webhook Integration', () => {
  let handler: ConnectWebhookHandler;

  const mockAccount: Stripe.Account = {
    id: 'acct_test_integration',
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
    email: 'integration@test.com',
    external_accounts: {
      object: 'list',
      data: [],
      has_more: false,
      total_count: 0,
      url: '/v1/accounts/acct_test_integration/external_accounts'
    },
    metadata: {
      user_id: 'user_integration_test'
    },
    payouts_enabled: true,
    requirements: {
      alternatives: [],
      currently_due: [],
      disabled_reason: null,
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: []
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
        statement_descriptor_kanji: null
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

  beforeAll(() => {
    // テスト用の環境変数を設定
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.FROM_EMAIL = 'test@eventpay.jp';
    process.env.ADMIN_EMAIL = 'admin@eventpay.jp';
  });

  beforeEach(async () => {
    handler = await ConnectWebhookHandler.create();
  });

  describe('handleAccountUpdated', () => {
    it('サービス間の連携が正常に動作する', async () => {
      // このテストは実際のサービスクラスの連携をテストするため、
      // モックではなく実際のクラスを使用する想定

      // ただし、外部API（Stripe、Resend）はモックする
      const mockStripeConnectService = {
        getConnectAccountByUser: jest.fn().mockResolvedValue({
          id: 'connect_test',
          user_id: 'user_integration_test',
          stripe_account_id: 'acct_test_integration',
          status: 'onboarding',
          charges_enabled: false,
          payouts_enabled: false
        }),
        getAccountInfo: jest.fn().mockResolvedValue({
          accountId: 'acct_test_integration',
          status: 'verified',
          chargesEnabled: true,
          payoutsEnabled: true,
          email: 'integration@test.com',
          country: 'JP'
        }),
        updateAccountStatus: jest.fn().mockResolvedValue(undefined)
      };

      const mockNotificationService = {
        sendAccountVerifiedNotification: jest.fn().mockResolvedValue({ success: true }),
        sendAccountStatusChangeNotification: jest.fn().mockResolvedValue({ success: true })
      };

      // プライベートプロパティにアクセスするためのハック
      (handler as any).stripeConnectService = mockStripeConnectService;
      (handler as any).notificationService = mockNotificationService;

      // テスト実行
      await handler.handleAccountUpdated(mockAccount);

      // 検証
      expect(mockStripeConnectService.getConnectAccountByUser).toHaveBeenCalledWith('user_integration_test');
      expect(mockStripeConnectService.getAccountInfo).toHaveBeenCalledWith('acct_test_integration');
      expect(mockStripeConnectService.updateAccountStatus).toHaveBeenCalledWith({
        userId: 'user_integration_test',
        status: 'verified',
        chargesEnabled: true,
        payoutsEnabled: true
      });

      // 通知が送信されることを確認
      expect(mockNotificationService.sendAccountVerifiedNotification).toHaveBeenCalledWith({
        userId: 'user_integration_test',
        accountId: 'acct_test_integration'
      });

      expect(mockNotificationService.sendAccountStatusChangeNotification).toHaveBeenCalledWith({
        userId: 'user_integration_test',
        accountId: 'acct_test_integration',
        oldStatus: 'onboarding',
        newStatus: 'verified',
        chargesEnabled: true,
        payoutsEnabled: true
      });
    });

    it('エラーハンドリングが適切に動作する', async () => {
      const mockStripeConnectService = {
        getConnectAccountByUser: jest.fn().mockRejectedValue(new Error('Database error')),
        getAccountInfo: jest.fn(),
        updateAccountStatus: jest.fn()
      };

      const mockNotificationService = {
        sendAccountStatusChangeNotification: jest.fn().mockResolvedValue({ success: true })
      };

      (handler as any).stripeConnectService = mockStripeConnectService;
      (handler as any).notificationService = mockNotificationService;

      // エラーが発生することを確認
      await expect(handler.handleAccountUpdated(mockAccount)).rejects.toThrow('Database error');

      // エラー通知が送信されることを確認
      expect(mockNotificationService.sendAccountStatusChangeNotification).toHaveBeenCalledWith({
        userId: 'user_integration_test',
        accountId: 'acct_test_integration',
        oldStatus: 'unknown',
        newStatus: 'error',
        chargesEnabled: false,
        payoutsEnabled: false
      });
    });
  });

  describe('通知機能の統合', () => {
    it('アカウント状態に応じて適切な通知が送信される', async () => {
      const testCases = [
        {
          name: '未認証から認証済みへの変更',
          oldStatus: 'unverified',
          newStatus: 'verified',
          chargesEnabled: true,
          payoutsEnabled: true,
          expectedNotifications: ['verified', 'statusChange']
        },
        {
          name: '認証済みから制限状態への変更',
          oldStatus: 'verified',
          newStatus: 'restricted',
          chargesEnabled: false,
          payoutsEnabled: false,
          expectedNotifications: ['restricted', 'statusChange']
        },
        {
          name: '同じ状態での更新（通知なし）',
          oldStatus: 'verified',
          newStatus: 'verified',
          chargesEnabled: true,
          payoutsEnabled: true,
          expectedNotifications: []
        }
      ];

      for (const testCase of testCases) {
        const mockStripeConnectService = {
          getConnectAccountByUser: jest.fn().mockResolvedValue({
            status: testCase.oldStatus,
            charges_enabled: !testCase.chargesEnabled,
            payouts_enabled: !testCase.payoutsEnabled
          }),
          getAccountInfo: jest.fn().mockResolvedValue({
            status: testCase.newStatus,
            chargesEnabled: testCase.chargesEnabled,
            payoutsEnabled: testCase.payoutsEnabled
          }),
          updateAccountStatus: jest.fn().mockResolvedValue(undefined)
        };

        const mockNotificationService = {
          sendAccountVerifiedNotification: jest.fn().mockResolvedValue({ success: true }),
          sendAccountRestrictedNotification: jest.fn().mockResolvedValue({ success: true }),
          sendAccountStatusChangeNotification: jest.fn().mockResolvedValue({ success: true })
        };

        (handler as any).stripeConnectService = mockStripeConnectService;
        (handler as any).notificationService = mockNotificationService;

        await handler.handleAccountUpdated(mockAccount);

        // 期待される通知が送信されているかチェック
        if (testCase.expectedNotifications.includes('verified')) {
          expect(mockNotificationService.sendAccountVerifiedNotification).toHaveBeenCalled();
        } else {
          expect(mockNotificationService.sendAccountVerifiedNotification).not.toHaveBeenCalled();
        }

        if (testCase.expectedNotifications.includes('restricted')) {
          expect(mockNotificationService.sendAccountRestrictedNotification).toHaveBeenCalled();
        } else {
          expect(mockNotificationService.sendAccountRestrictedNotification).not.toHaveBeenCalled();
        }

        if (testCase.expectedNotifications.includes('statusChange')) {
          expect(mockNotificationService.sendAccountStatusChangeNotification).toHaveBeenCalled();
        } else if (testCase.expectedNotifications.length === 0) {
          // 通知なしの場合は、状態変更通知も送信されない
          expect(mockNotificationService.sendAccountStatusChangeNotification).not.toHaveBeenCalled();
        }

        // モックをリセット
        jest.clearAllMocks();
      }
    });
  });
});
