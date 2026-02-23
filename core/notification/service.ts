/**
 * 通知サービスの実装
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError, errFrom, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { buildGuestUrl } from "@core/utils/guest-token";

import { Database } from "@/types/database";

import { EmailNotificationService } from "./email-service";
import { buildEmailIdempotencyKey } from "./idempotency";
import {
  buildAccountRestrictedTemplate,
  buildAccountStatusChangedTemplate,
  buildAccountVerifiedTemplate,
  buildParticipationRegisteredTemplate,
  buildPaymentCompletedTemplate,
} from "./templates";
import {
  INotificationService,
  IEmailNotificationService,
  NotificationResult,
  StripeConnectNotificationData,
  AccountStatusChangeNotification,
  AccountRestrictedNotification,
  ParticipationRegisteredNotification,
  PaymentCompletedNotification,
} from "./types";

/**
 * 通知サービスの実装クラス
 */
export class NotificationService implements INotificationService {
  private supabase: SupabaseClient<Database, "public">;
  private emailService: IEmailNotificationService;

  constructor(supabase: SupabaseClient<Database, "public">) {
    this.supabase = supabase;
    this.emailService = new EmailNotificationService();
  }

  /**
   * アカウント認証完了通知を送信
   */
  async sendAccountVerifiedNotification(
    data: StripeConnectNotificationData
  ): Promise<NotificationResult> {
    try {
      // ユーザー情報を取得
      const userInfo = await this.getUserInfo(data.userId);
      if (!userInfo) {
        return errResult(
          new AppError("NOT_FOUND", {
            userMessage: "ユーザー情報が見つかりません",
            retryable: false,
            details: { userId: data.userId },
          })
        );
      }

      return await this.emailService.sendEmail({
        to: userInfo.email,
        template: buildAccountVerifiedTemplate({
          userName: userInfo.name || "ユーザー",
        }),
        idempotencyKey: buildEmailIdempotencyKey({
          scope: "account-verified",
          parts: [data.userId, data.accountId],
        }),
      });
    } catch (error) {
      return errFrom(error, {
        defaultCode: "EMAIL_SENDING_FAILED",
      });
    }
  }

  /**
   * アカウント制限通知を送信
   */
  async sendAccountRestrictedNotification(
    data: AccountRestrictedNotification
  ): Promise<NotificationResult> {
    try {
      // ユーザー情報を取得
      const userInfo = await this.getUserInfo(data.userId);
      if (!userInfo) {
        return errResult(
          new AppError("NOT_FOUND", {
            userMessage: "ユーザー情報が見つかりません",
            retryable: false,
            details: { userId: data.userId },
          })
        );
      }

      const result = await this.emailService.sendEmail({
        to: userInfo.email,
        template: buildAccountRestrictedTemplate({
          userName: userInfo.name || "ユーザー",
          restrictionReason: data.restrictionReason,
          requiredActions: data.requiredActions,
          dashboardUrl: data.dashboardUrl,
        }),
        idempotencyKey: buildEmailIdempotencyKey({
          scope: "account-restricted-user",
          parts: [
            data.userId,
            data.accountId,
            data.restrictionReason,
            (data.requiredActions || []).join(","),
            data.dashboardUrl,
          ],
        }),
      });

      // 管理者にもアラートを送信（失敗してもユーザー通知の結果には影響させない）
      const adminAlertResult = await this.emailService.sendAdminAlert({
        subject: "Stripeアカウント制限",
        message: `ユーザー ${data.userId} のStripeアカウント ${data.accountId} に制限が設定されました。`,
        details: {
          userId: data.userId,
          accountId: data.accountId,
          restrictionReason: data.restrictionReason,
          requiredActions: data.requiredActions,
        },
        idempotencyKey: buildEmailIdempotencyKey({
          scope: "account-restricted-admin",
          parts: [
            data.userId,
            data.accountId,
            data.restrictionReason,
            (data.requiredActions || []).join(","),
            data.dashboardUrl,
          ],
        }),
      });

      // 管理者アラートが失敗してもログのみ記録（ユーザー通知の成功/失敗は返す）
      if (!adminAlertResult.success) {
        // email-service側で詳細なログは記録済みなので、ここでは簡潔に
        logger.warn("Admin alert failed for account restriction", {
          category: "email",
          action: "send_admin_alert",
          actor_type: "system",
          user_id: data.userId,
          account_id: data.accountId,
          outcome: "failure",
        });
      }

      return result;
    } catch (error) {
      return errFrom(error, {
        defaultCode: "EMAIL_SENDING_FAILED",
      });
    }
  }

  /**
   * アカウント状態変更通知を送信
   */
  async sendAccountStatusChangeNotification(
    data: AccountStatusChangeNotification
  ): Promise<NotificationResult> {
    try {
      // 重要な状態変更のみ通知
      if (this.shouldNotifyStatusChange(data.oldStatus as string, data.newStatus as string)) {
        // ユーザー情報を取得
        const userInfo = await this.getUserInfo(data.userId);
        if (!userInfo) {
          return errResult(
            new AppError("NOT_FOUND", {
              userMessage: "ユーザー情報が見つかりません",
              retryable: false,
              details: { userId: data.userId },
            })
          );
        }

        return await this.emailService.sendEmail({
          to: userInfo.email,
          template: buildAccountStatusChangedTemplate({
            userName: userInfo.name || "ユーザー",
            oldStatus: data.oldStatus,
            newStatus: data.newStatus,
            chargesEnabled: data.chargesEnabled,
            payoutsEnabled: data.payoutsEnabled,
          }),
          idempotencyKey: buildEmailIdempotencyKey({
            scope: "account-status-change",
            parts: [
              data.userId,
              data.accountId,
              data.oldStatus,
              data.newStatus,
              data.chargesEnabled,
              data.payoutsEnabled,
            ],
          }),
        });
      }

      return okResult(undefined, { skipped: true });
    } catch (error) {
      return errFrom(error, {
        defaultCode: "EMAIL_SENDING_FAILED",
      });
    }
  }

  /**
   * ユーザー情報を取得
   */
  private async getUserInfo(userId: string): Promise<{ email: string; name?: string } | null> {
    try {
      // usersテーブルからnameを取得
      const { data: userData, error: userError } = await this.supabase
        .from("users")
        .select("name")
        .eq("id", userId)
        .single();

      if (userError) {
        return null;
      }

      // Supabase Authからemailを取得
      const { data: authData, error: authError } =
        await this.supabase.auth.admin.getUserById(userId);

      if (authError || !authData.user?.email) {
        return null;
      }

      return {
        email: authData.user.email,
        name: userData?.name,
      };
    } catch (_error) {
      return null;
    }
  }

  /**
   * 参加登録完了通知を送信
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

  /**
   * 状態変更の通知が必要かチェック
   */
  private shouldNotifyStatusChange(oldStatus: string, newStatus: string): boolean {
    // 認証完了や制限状態への変更は通知
    const importantTransitions = [
      { from: "unverified", to: "verified" },
      { from: "onboarding", to: "verified" },
      { from: "verified", to: "restricted" },
      { from: "onboarding", to: "restricted" },
    ];

    return importantTransitions.some(
      (transition) => transition.from === oldStatus && transition.to === newStatus
    );
  }
}
