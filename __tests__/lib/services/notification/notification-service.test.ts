/**
 * NotificationService のテスト
 */

import { NotificationService } from '@/lib/services/notification/service';
import { EmailNotificationService } from '@/lib/services/notification/email-service';
import type { StripeConnectNotificationData, AccountRestrictedNotification } from '@/lib/services/notification/types';

// モック
jest.mock('@/lib/services/notification/email-service');
jest.mock('@supabase/supabase-js');

const mockEmailNotificationService = EmailNotificationService as jest.MockedClass<typeof EmailNotificationService>;

describe('NotificationService', () => {
  let service: NotificationService;
  let mockEmailService: any;
  let mockSupabase: any;

  beforeEach(() => {
    // EmailNotificationServiceのモック
    mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'test-message-id' }),
      sendAdminAlert: jest.fn().mockResolvedValue({ success: true })
    };
    mockEmailNotificationService.mockImplementation(() => mockEmailService);

    // Supabaseクライアントのモック
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { email: 'test@example.com', name: 'テストユーザー' },
        error: null
      })
    };

    // createClientのモック
    const { createClient } = require('@supabase/supabase-js');
    createClient.mockReturnValue(mockSupabase);

    service = new NotificationService('test-url', 'test-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendAccountVerifiedNotification', () => {
    const notificationData: StripeConnectNotificationData = {
      userId: 'user_test_123',
      accountId: 'acct_test_123'
    };

    it('アカウント認証完了通知を正常に送信する', async () => {
      const result = await service.sendAccountVerifiedNotification(notificationData);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');

      expect(mockSupabase.from).toHaveBeenCalledWith('users');
      expect(mockSupabase.select).toHaveBeenCalledWith('email, name');
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'user_test_123');

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        template: expect.objectContaining({
          subject: 'Stripe Connectアカウントの認証が完了しました',
          body: expect.stringContaining('テストユーザー'),
          htmlBody: expect.stringContaining('テストユーザー')
        })
      });
    });

    it('ユーザーが見つからない場合はエラーを返す', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: null
      });
      if (typeof mockSupabase.maybeSingle === 'function') {
        mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
      }

      const result = await service.sendAccountVerifiedNotification(notificationData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('ユーザー情報が見つかりません');
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('sendAccountRestrictedNotification', () => {
    const restrictedData: AccountRestrictedNotification = {
      userId: 'user_test_123',
      accountId: 'acct_test_123',
      restrictionReason: '必要な情報の提出期限が過ぎています',
      requiredActions: ['現在必要な情報を提出してください', '個人番号を提出してください'],
      dashboardUrl: 'https://dashboard.stripe.com/connect/accounts/acct_test_123'
    };

    it('アカウント制限通知を正常に送信する', async () => {
      const result = await service.sendAccountRestrictedNotification(restrictedData);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        template: expect.objectContaining({
          subject: 'Stripe Connectアカウントに制限が設定されました',
          body: expect.stringContaining('必要な情報の提出期限が過ぎています'),
          htmlBody: expect.stringContaining('必要な情報の提出期限が過ぎています')
        })
      });

      // 管理者アラートも送信されることを確認
      expect(mockEmailService.sendAdminAlert).toHaveBeenCalledWith({
        subject: 'Stripe Connectアカウント制限',
        message: expect.stringContaining('user_test_123'),
        details: expect.objectContaining({
          userId: 'user_test_123',
          accountId: 'acct_test_123',
          restrictionReason: '必要な情報の提出期限が過ぎています'
        })
      });
    });
  });

  describe('sendAccountStatusChangeNotification', () => {
    it('重要な状態変更の場合は通知を送信する', async () => {
      const statusChangeData = {
        userId: 'user_test_123',
        accountId: 'acct_test_123',
        oldStatus: 'onboarding',
        newStatus: 'verified',
        chargesEnabled: true,
        payoutsEnabled: true
      };

      const result = await service.sendAccountStatusChangeNotification(statusChangeData);

      expect(result.success).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        template: expect.objectContaining({
          subject: 'Stripe Connectアカウントの状態が更新されました',
          body: expect.stringContaining('認証中 → 認証済み'),
          htmlBody: expect.stringContaining('認証中 → 認証済み')
        })
      });
    });

    it('重要でない状態変更の場合は通知をスキップする', async () => {
      const statusChangeData = {
        userId: 'user_test_123',
        accountId: 'acct_test_123',
        oldStatus: 'verified',
        newStatus: 'verified', // 同じ状態
        chargesEnabled: true,
        payoutsEnabled: true
      };

      const result = await service.sendAccountStatusChangeNotification(statusChangeData);

      expect(result.success).toBe(true);
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('メール本文生成', () => {
    it('アカウント認証完了メールの本文が正しく生成される', async () => {
      const notificationData: StripeConnectNotificationData = {
        userId: 'user_test_123',
        accountId: 'acct_test_123'
      };

      await service.sendAccountVerifiedNotification(notificationData);

      const emailCall = mockEmailService.sendEmail.mock.calls[0][0];
      const template = emailCall.template;

      expect(template.body).toContain('テストユーザー 様');
      expect(template.body).toContain('Stripe Connectアカウントの認証が完了しました');
      expect(template.body).toContain('イベントの売上を自動的に受け取ることができるようになりました');

      expect(template.htmlBody).toContain('<h2');
      expect(template.htmlBody).toContain('テストユーザー');
      expect(template.htmlBody).toContain('✅');
    });

    it('アカウント制限メールの本文が正しく生成される', async () => {
      const restrictedData: AccountRestrictedNotification = {
        userId: 'user_test_123',
        accountId: 'acct_test_123',
        restrictionReason: 'テスト制限理由',
        requiredActions: ['アクション1', 'アクション2'],
        dashboardUrl: 'https://test-dashboard.com'
      };

      await service.sendAccountRestrictedNotification(restrictedData);

      const emailCall = mockEmailService.sendEmail.mock.calls[0][0];
      const template = emailCall.template;

      expect(template.body).toContain('制限理由: テスト制限理由');
      expect(template.body).toContain('- アクション1');
      expect(template.body).toContain('- アクション2');
      expect(template.body).toContain('https://test-dashboard.com');

      expect(template.htmlBody).toContain('⚠️');
      expect(template.htmlBody).toContain('<li>アクション1</li>');
      expect(template.htmlBody).toContain('<li>アクション2</li>');
    });
  });
});
