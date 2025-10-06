/**
 * 通知サービスの実装
 */
import * as React from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { Database } from "@/types/database";

import { EmailNotificationService } from "./email-service";
import {
  INotificationService,
  IEmailNotificationService,
  NotificationResult,
  StripeConnectNotificationData,
  AccountStatusChangeNotification,
  AccountRestrictedNotification,
  EmailTemplate,
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
        return {
          success: false,
          error: "ユーザー情報が見つかりません",
        };
      }

      const { default: AccountVerifiedEmail } = await import(
        "@/emails/connect/AccountVerifiedEmail"
      );

      const template: EmailTemplate = {
        subject: "Stripeアカウントの認証が完了しました",
        react: React.createElement(AccountVerifiedEmail, {
          userName: userInfo.name || "ユーザー",
        }),
      };

      return await this.emailService.sendEmail({
        to: userInfo.email,
        template,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "通知送信中にエラーが発生しました",
      };
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
        return {
          success: false,
          error: "ユーザー情報が見つかりません",
        };
      }

      const { default: AccountRestrictedEmail } = await import(
        "@/emails/connect/AccountRestrictedEmail"
      );

      const template: EmailTemplate = {
        subject: "Stripeアカウントに制限が設定されました",
        react: React.createElement(AccountRestrictedEmail, {
          userName: userInfo.name || "ユーザー",
          restrictionReason: data.restrictionReason,
          requiredActions: data.requiredActions,
          dashboardUrl: data.dashboardUrl,
        }),
      };

      const result = await this.emailService.sendEmail({
        to: userInfo.email,
        template,
      });

      // 管理者にもアラートを送信
      await this.emailService.sendAdminAlert({
        subject: "Stripeアカウント制限",
        message: `ユーザー ${data.userId} のStripeアカウント ${data.accountId} に制限が設定されました。`,
        details: {
          userId: data.userId,
          accountId: data.accountId,
          restrictionReason: data.restrictionReason,
          requiredActions: data.requiredActions,
        },
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "通知送信中にエラーが発生しました",
      };
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
          return {
            success: false,
            error: "ユーザー情報が見つかりません",
          };
        }

        const { default: AccountStatusChangedEmail } = await import(
          "@/emails/connect/AccountStatusChangedEmail"
        );

        const template: EmailTemplate = {
          subject: "Stripeアカウントの状態が更新されました",
          react: React.createElement(AccountStatusChangedEmail, {
            userName: userInfo.name || "ユーザー",
            oldStatus: data.oldStatus,
            newStatus: data.newStatus,
            chargesEnabled: data.chargesEnabled,
            payoutsEnabled: data.payoutsEnabled,
          }),
        };

        return await this.emailService.sendEmail({
          to: userInfo.email,
          template,
        });
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "通知送信中にエラーが発生しました",
      };
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
