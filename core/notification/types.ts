/**
 * 通知サービスの型定義
 */

import type { AppResult } from "@core/errors";
import type { StripeAccountStatus } from "@core/types/statuses";

/**
 * Resendエラータイプ
 */
export type ResendErrorType = "transient" | "permanent";

/**
 * 通知結果メタデータ
 */
export interface NotificationMeta {
  providerMessageId?: string;
  /** エラータイプ（一時的または恒久的） */
  errorType?: ResendErrorType;
  /** リトライ回数 */
  retryCount?: number;
  /** ResendやWebhook先のステータスコード */
  statusCode?: number;
  /** 通知処理をスキップしたか */
  skipped?: boolean;
}

/**
 * 通知結果
 */
export type NotificationResult = AppResult<void, NotificationMeta>;

/**
 * HTML/TEXT形式のメールテンプレート
 */
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
  fromEmail?: string; // 送信者メールアドレス
  fromName?: string; // 送信者名
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
  oldStatus: StripeAccountStatus;
  newStatus: StripeAccountStatus;
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
 * 参加登録完了通知データ
 */
export interface ParticipationRegisteredNotification {
  email: string;
  nickname: string;
  eventTitle: string;
  eventDate: string;
  attendanceStatus: "attending" | "maybe" | "not_attending";
  guestToken: string;
  inviteToken: string;
}

/**
 * 決済完了通知データ
 */
export interface PaymentCompletedNotification {
  email: string;
  nickname: string;
  eventTitle: string;
  amount: number;
  paidAt: string;
  /** Stripeの公式レシートURL（オプショナル） */
  receiptUrl?: string;
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

  /**
   * 参加登録完了通知を送信
   */
  sendParticipationRegisteredNotification(
    data: ParticipationRegisteredNotification
  ): Promise<NotificationResult>;

  /**
   * 決済完了通知を送信
   */
  sendPaymentCompletedNotification(data: PaymentCompletedNotification): Promise<NotificationResult>;
}

/**
 * メール通知サービスインターフェース
 */
export interface IEmailNotificationService {
  /**
   * メール送信
   */
  sendEmail(params: {
    to: string;
    template: EmailTemplate;
    idempotencyKey?: string;
  }): Promise<NotificationResult>;

  /**
   * 管理者向けアラートメール送信
   */
  sendAdminAlert(params: {
    subject: string;
    message: string;
    details?: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<NotificationResult>;
}

/**
 * Resendエラー情報
 */
export interface ResendErrorInfo {
  type: ResendErrorType;
  message: string;
  name?: string;
}
