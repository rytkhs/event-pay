/**
 * 通知サービスの型定義
 */

import * as React from "react";

/**
 * 通知結果
 */
export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * React Emailコンポーネントを使用したメールテンプレート
 */
export interface EmailTemplate {
  subject: string;
  react: React.ReactElement;
  from?: string;
  replyTo?: string;
}

/**
 * Stripe Connect関連の通知データ
 */
export interface StripeConnectNotificationData {
  userId: string;
  accountId: string;
  userEmail?: string;
  userName?: string;
}

/**
 * アカウント状態変更通知データ
 */
export interface AccountStatusChangeNotification extends StripeConnectNotificationData {
  oldStatus: import("@core/types/enums").StripeAccountStatus;
  newStatus: import("@core/types/enums").StripeAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

/**
 * アカウント制限通知データ
 */
export interface AccountRestrictedNotification extends StripeConnectNotificationData {
  restrictionReason?: string;
  requiredActions?: string[];
  dashboardUrl?: string;
}

/**
 * 通知サービスインターフェース
 */
export interface INotificationService {
  /**
   * アカウント認証完了通知を送信
   */
  sendAccountVerifiedNotification(data: StripeConnectNotificationData): Promise<NotificationResult>;

  /**
   * アカウント制限通知を送信
   */
  sendAccountRestrictedNotification(
    data: AccountRestrictedNotification
  ): Promise<NotificationResult>;

  /**
   * アカウント状態変更通知を送信
   */
  sendAccountStatusChangeNotification(
    data: AccountStatusChangeNotification
  ): Promise<NotificationResult>;
}

/**
 * メール通知サービスインターフェース
 */
export interface IEmailNotificationService {
  /**
   * メール送信
   */
  sendEmail(params: { to: string; template: EmailTemplate }): Promise<NotificationResult>;

  /**
   * 管理者向けアラートメール送信
   */
  sendAdminAlert(params: {
    subject: string;
    message: string;
    details?: Record<string, any>;
  }): Promise<NotificationResult>;
}
