/**
 * 通知サービスの型定義
 */

import type { AppResult } from "@core/errors";

/**
 * メール送信エラータイプ
 */
export type EmailErrorType = "transient" | "permanent";

/**
 * 通知結果メタデータ
 */
export interface NotificationMeta {
  providerMessageId?: string;
  /** エラータイプ（一時的または恒久的） */
  errorType?: EmailErrorType;
  /** リトライ回数 */
  retryCount?: number;
  /** ResendやWebhook先のステータスコード */
  statusCode?: number;
  /** プロバイダのエラー名 */
  providerErrorName?: string;
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
 * 回答完了通知データ
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
   * 回答完了通知を送信
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
 * メール送信エラー情報
 */
export interface EmailErrorInfo {
  type: EmailErrorType;
  message: string;
  name?: string;
  statusCode?: number;
}
