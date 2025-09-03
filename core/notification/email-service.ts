/**
 * メール通知サービスの実装
 */

import { Resend } from "resend";

import { logger } from "@core/logging/app-logger";

import { IEmailNotificationService, EmailTemplate, NotificationResult } from "./types";

/**
 * Resendを使用したメール通知サービス
 */
export class EmailNotificationService implements IEmailNotificationService {
  private resend: Resend;
  private fromEmail: string;
  private adminEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is required");
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = process.env.FROM_EMAIL || "noreply@eventpay.jp";
    this.adminEmail = process.env.ADMIN_EMAIL || "admin@eventpay.jp";
  }

  /**
   * メール送信
   */
  async sendEmail(params: { to: string; template: EmailTemplate }): Promise<NotificationResult> {
    try {
      const { to, template } = params;

      const emailData: any = {
        from: template.from || this.fromEmail,
        to: [to],
        subject: template.subject,
        text: template.body,
      };

      // HTMLボディが指定されている場合は追加
      if (template.htmlBody) {
        emailData.html = template.htmlBody;
      }

      // Reply-Toが指定されている場合は追加
      if (template.replyTo) {
        emailData.reply_to = template.replyTo;
      }

      const result = await this.resend.emails.send(emailData);

      if (result.error) {
        return {
          success: false,
          error: result.error.message || "メール送信に失敗しました",
        };
      }

      return {
        success: true,
        messageId: result.data?.id,
      };
    } catch (error) {
      logger.error("Email sending error", {
        tag: "emailService",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "メール送信中に予期しないエラーが発生しました",
      };
    }
  }

  /**
   * 管理者向けアラートメール送信
   */
  async sendAdminAlert(params: {
    subject: string;
    message: string;
    details?: Record<string, any>;
  }): Promise<NotificationResult> {
    try {
      const { subject, message, details } = params;

      let body = message;
      if (details) {
        body += "\n\n詳細情報:\n";
        body += JSON.stringify(details, null, 2);
      }

      const template: EmailTemplate = {
        subject: `[EventPay Alert] ${subject}`,
        body: body,
        from: this.fromEmail,
      };

      return await this.sendEmail({
        to: this.adminEmail,
        template,
      });
    } catch (error) {
      logger.error("Admin alert email error", {
        tag: "emailService",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "管理者アラート送信中にエラーが発生しました",
      };
    }
  }
}
