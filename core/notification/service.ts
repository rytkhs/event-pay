/**
 * 通知サービスの実装
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { errFrom } from "@core/errors";
import { buildGuestUrl } from "@core/utils/guest-token";

import type { Database } from "@/types/database";

import { EmailNotificationService } from "./email-service";
import { buildEmailIdempotencyKey } from "./idempotency";
import { buildParticipationRegisteredTemplate, buildPaymentCompletedTemplate } from "./templates";
import {
  INotificationService,
  IEmailNotificationService,
  NotificationResult,
  ParticipationRegisteredNotification,
  PaymentCompletedNotification,
} from "./types";

/**
 * 通知サービスの実装クラス
 */
export class NotificationService implements INotificationService {
  private emailService: IEmailNotificationService;

  constructor(_supabase: SupabaseClient<Database, "public">) {
    this.emailService = new EmailNotificationService();
  }

  /**
   * 回答完了通知を送信
   */
  async sendParticipationRegisteredNotification(
    data: ParticipationRegisteredNotification
  ): Promise<NotificationResult> {
    try {
      const guestUrl = buildGuestUrl(data.guestToken);

      return await this.emailService.sendEmail({
        to: data.email,
        template: buildParticipationRegisteredTemplate({
          nickname: data.nickname,
          eventTitle: data.eventTitle,
          eventDate: data.eventDate,
          attendanceStatus: data.attendanceStatus,
          guestUrl,
        }),
        idempotencyKey: buildEmailIdempotencyKey({
          scope: "participation-registered",
          parts: [
            data.guestToken,
            data.inviteToken,
            data.email,
            data.eventTitle,
            data.eventDate,
            data.attendanceStatus,
          ],
        }),
      });
    } catch (error) {
      return errFrom(error, {
        defaultCode: "EMAIL_SENDING_FAILED",
      });
    }
  }

  /**
   * 決済完了通知を送信
   */
  async sendPaymentCompletedNotification(
    data: PaymentCompletedNotification
  ): Promise<NotificationResult> {
    try {
      return await this.emailService.sendEmail({
        to: data.email,
        template: buildPaymentCompletedTemplate({
          nickname: data.nickname,
          eventTitle: data.eventTitle,
          amount: data.amount,
          paidAt: data.paidAt,
          receiptUrl: data.receiptUrl,
        }),
        idempotencyKey: buildEmailIdempotencyKey({
          scope: "payment-completed",
          parts: [data.email, data.eventTitle, data.amount, data.paidAt, data.receiptUrl || ""],
        }),
      });
    } catch (error) {
      return errFrom(error, {
        defaultCode: "EMAIL_SENDING_FAILED",
      });
    }
  }
}
