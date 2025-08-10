/**
 * Stripe Connect Webhook ハンドラー
 */

import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';
import { createStripeConnectServiceWithClient, type StripeConnectService } from '@/lib/services/stripe-connect';
import { NotificationService } from '@/lib/services/notification';
import { SecureSupabaseClientFactory } from '@/lib/security/secure-client-factory.impl';
import { AdminReason } from '@/lib/security/secure-client-factory.types';
import type {
  AccountStatusChangeNotification,
  AccountRestrictedNotification,
  StripeConnectNotificationData
} from '@/lib/services/notification/types';
import type { StripeAccountStatusLike } from '@/lib/services/stripe-connect/types';

/**
 * Connect Webhook イベントハンドラー
 */
export class ConnectWebhookHandler {
  private supabase: SupabaseClient<Database>;
  private stripeConnectService: StripeConnectService;
  private notificationService: NotificationService;

  private constructor(
    supabase: SupabaseClient<Database>,
    stripeConnectService: StripeConnectService,
    notificationService: NotificationService
  ) {
    this.supabase = supabase;
    this.stripeConnectService = stripeConnectService;
    this.notificationService = notificationService;
  }

  /**
   * 監査付きのWebhookハンドラーを作成
   */
  static async create(): Promise<ConnectWebhookHandler> {
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.SYSTEM_MAINTENANCE,
      "Stripe Connect webhook processing"
    );

    // 既に生成済みの adminClient を共有して StripeConnectService を構築
    const stripeConnectService = createStripeConnectServiceWithClient(adminClient as SupabaseClient<Database>);

    // NotificationServiceも監査付きクライアントを使用するか、
    const notificationService = new NotificationService(adminClient as SupabaseClient<Database>);

    return new ConnectWebhookHandler(
      adminClient as SupabaseClient<Database>,
      stripeConnectService,
      notificationService
    );
  }

  /**
   * account.updated イベントを処理
   */
  async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    try {
      // メタデータからユーザーIDを取得
      const userId = account.metadata?.user_id;
      if (!userId) {
        console.warn(`Account ${account.id} has no user_id in metadata`);
        return;
      }

      // 現在のアカウント状態を取得（存在しない場合でも処理継続し、挿入で追従）
      const currentAccount = await this.stripeConnectService.getConnectAccountByUser(userId);

      // Stripeからアカウント情報を取得
      const accountInfo = await this.stripeConnectService.getAccountInfo(account.id);

      // 状態変更を記録（存在しない場合は未知扱い）
      const oldStatus = currentAccount?.status ?? 'unknown';
      const newStatus = accountInfo.status;

      // データベースのアカウント情報を更新
      await this.stripeConnectService.updateAccountStatus({
        userId,
        status: accountInfo.status,
        chargesEnabled: accountInfo.chargesEnabled,
        payoutsEnabled: accountInfo.payoutsEnabled,
        // レコードが無い場合の追従作成に必要
        stripeAccountId: account.id,
      });

      console.log(`Updated account status for user ${userId}: ${oldStatus} → ${newStatus}`);

      // 通知を送信
      await this.sendNotifications(userId, account.id, oldStatus, accountInfo);

      // セキュリティログを記録
      await this.logAccountUpdate(userId, account.id, oldStatus, accountInfo);

    } catch (error) {
      console.error('Error handling account.updated event:', error);

      // 管理者にエラー通知を送信
      try {
        await this.notificationService.sendAccountStatusChangeNotification({
          userId: account.metadata?.user_id || 'unknown',
          accountId: account.id,
          oldStatus: 'unknown',
          newStatus: 'error',
          chargesEnabled: false,
          payoutsEnabled: false
        });
      } catch (notificationError) {
        console.error('Failed to send error notification:', notificationError);
      }

      throw error;
    }
  }

  /**
   * 通知を送信
   */
  private async sendNotifications(
    userId: string,
    accountId: string,
    oldStatus: StripeAccountStatusLike,
    accountInfo: {
      status: StripeAccountStatusLike;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      requirements?: {
        disabled_reason?: string;
        currently_due?: string[];
        past_due?: string[];
      };
    }
  ): Promise<void> {
    try {
      const baseNotificationData: StripeConnectNotificationData = {
        userId,
        accountId
      };

      // アカウント認証完了の通知
      if (oldStatus !== 'verified' && accountInfo.status === 'verified' &&
        accountInfo.chargesEnabled && accountInfo.payoutsEnabled) {

        await this.notificationService.sendAccountVerifiedNotification(baseNotificationData);
        console.log(`Sent account verified notification for user ${userId}`);
      }

      // アカウント制限の通知
      if (accountInfo.status === 'restricted') {
        const restrictedNotification: AccountRestrictedNotification = {
          ...baseNotificationData,
          restrictionReason: this.getRestrictionReason(accountInfo),
          requiredActions: this.getRequiredActions(accountInfo),
          dashboardUrl: `https://dashboard.stripe.com/connect/accounts/${accountId}`
        };

        await this.notificationService.sendAccountRestrictedNotification(restrictedNotification);
        console.log(`Sent account restricted notification for user ${userId}`);
      }

      // 状態変更の通知（重要な変更のみ）
      if (this.shouldNotifyStatusChange(oldStatus, accountInfo.status)) {
        const statusChangeNotification: AccountStatusChangeNotification = {
          ...baseNotificationData,
          oldStatus,
          newStatus: accountInfo.status,
          chargesEnabled: accountInfo.chargesEnabled,
          payoutsEnabled: accountInfo.payoutsEnabled
        };

        await this.notificationService.sendAccountStatusChangeNotification(statusChangeNotification);
        console.log(`Sent status change notification for user ${userId}: ${oldStatus} → ${accountInfo.status}`);
      }

    } catch (error) {
      console.error('Error sending notifications:', error);
      // 通知エラーは処理を停止させない
    }
  }

  /**
   * セキュリティログを記録
   */
  private async logAccountUpdate(
    userId: string,
    accountId: string,
    oldStatus: string,
    accountInfo: {
      status: string;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      requirements?: {
        disabled_reason?: string;
        currently_due?: string[];
        past_due?: string[];
      };
    }
  ): Promise<void> {
    try {
      const logData = {
        event_type: 'stripe_connect_account_updated',
        user_id: userId,
        details: {
          accountId,
          oldStatus,
          newStatus: accountInfo.status,
          chargesEnabled: accountInfo.chargesEnabled,
          payoutsEnabled: accountInfo.payoutsEnabled,
          requirements: accountInfo.requirements,
          timestamp: new Date().toISOString()
        }
      };

      // セキュリティログテーブルに記録（存在する場合）
      try {
        const { error } = await this.supabase
          .from('security_audit_log')
          .insert(logData);

        if (error && error.code !== '42P01') { // テーブルが存在しない場合は無視
          console.error('Failed to log account update:', error);
        }
      } catch (dbError) {
        // データベースエラーは無視（ログ機能は必須ではない）
        console.debug('Security log table not available:', dbError);
      }

    } catch (error) {
      console.error('Error logging account update:', error);
      // ログエラーは処理を停止させない
    }
  }

  /**
   * 制限理由を取得
   */
  private getRestrictionReason(accountInfo: { requirements?: { disabled_reason?: string } }): string | undefined {
    if (accountInfo.requirements?.disabled_reason) {
      const reasonMap: Record<string, string> = {
        'requirements.past_due': '必要な情報の提出期限が過ぎています',
        'requirements.pending_verification': '提出された情報の確認が必要です',
        'listed': 'アカウントがリストに掲載されています',
        'platform_paused': 'プラットフォームによって一時停止されています',
        'rejected.fraud': '不正行為の疑いがあります',
        'rejected.listed': 'リストに掲載されているため拒否されました',
        'rejected.terms_of_service': '利用規約違反のため拒否されました',
        'rejected.other': 'その他の理由で拒否されました',
        'under_review': '審査中です',
        'other': 'その他の理由'
      };

      return reasonMap[accountInfo.requirements.disabled_reason] ||
        accountInfo.requirements.disabled_reason;
    }

    return undefined;
  }

  /**
   * 必要なアクションを取得
   */
  private getRequiredActions(accountInfo: { requirements?: { currently_due?: string[]; past_due?: string[] } }): string[] {
    const actions: string[] = [];

    if (accountInfo.requirements?.currently_due && accountInfo.requirements.currently_due.length > 0) {
      actions.push('現在必要な情報を提出してください');

      // 具体的な必要項目を追加
      const dueItems = accountInfo.requirements?.currently_due ?? [];
      if (dueItems.includes('individual.id_number')) {
        actions.push('個人番号（マイナンバー）を提出してください');
      }
      if (dueItems.includes('individual.verification.document')) {
        actions.push('本人確認書類を提出してください');
      }
      if (dueItems.includes('business_profile.url')) {
        actions.push('事業のウェブサイトURLを入力してください');
      }
    }

    if (accountInfo.requirements?.past_due && accountInfo.requirements.past_due.length > 0) {
      actions.push('期限切れの情報を更新してください');
    }

    if (actions.length === 0) {
      actions.push('Stripeダッシュボードで詳細をご確認ください');
    }

    return actions;
  }

  /**
   * 状態変更の通知が必要かチェック
   */
  private shouldNotifyStatusChange(oldStatus: StripeAccountStatusLike, newStatus: StripeAccountStatusLike): boolean {
    // 重要な状態変更のみ通知
    const importantTransitions = [
      { from: 'unverified', to: 'onboarding' },
      { from: 'unverified', to: 'verified' },
      { from: 'onboarding', to: 'verified' },
      { from: 'verified', to: 'restricted' },
      { from: 'onboarding', to: 'restricted' },
      { from: 'restricted', to: 'verified' },
      { from: 'restricted', to: 'onboarding' }
    ];

    return importantTransitions.some(
      transition => transition.from === oldStatus && transition.to === newStatus
    );
  }
}
