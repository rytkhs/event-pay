/**
 * 通知サービスの実装
 */
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
  private supabase: SupabaseClient<Database>;
  private emailService: IEmailNotificationService;

  constructor(supabase: SupabaseClient<Database>) {
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

      const template: EmailTemplate = {
        subject: "Stripe Connectアカウントの認証が完了しました",
        body: this.createAccountVerifiedEmailBody(userInfo.name || "ユーザー"),
        htmlBody: this.createAccountVerifiedEmailHtml(userInfo.name || "ユーザー"),
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

      const template: EmailTemplate = {
        subject: "Stripe Connectアカウントに制限が設定されました",
        body: this.createAccountRestrictedEmailBody(
          userInfo.name || "ユーザー",
          data.restrictionReason,
          data.requiredActions,
          data.dashboardUrl
        ),
        htmlBody: this.createAccountRestrictedEmailHtml(
          userInfo.name || "ユーザー",
          data.restrictionReason,
          data.requiredActions,
          data.dashboardUrl
        ),
      };

      const result = await this.emailService.sendEmail({
        to: userInfo.email,
        template,
      });

      // 管理者にもアラートを送信
      await this.emailService.sendAdminAlert({
        subject: "Stripe Connectアカウント制限",
        message: `ユーザー ${data.userId} のStripe Connectアカウント ${data.accountId} に制限が設定されました。`,
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
      if (this.shouldNotifyStatusChange(data.oldStatus, data.newStatus)) {
        // ユーザー情報を取得
        const userInfo = await this.getUserInfo(data.userId);
        if (!userInfo) {
          return {
            success: false,
            error: "ユーザー情報が見つかりません",
          };
        }

        const template: EmailTemplate = {
          subject: "Stripe Connectアカウントの状態が更新されました",
          body: this.createStatusChangeEmailBody(
            userInfo.name || "ユーザー",
            data.oldStatus,
            data.newStatus,
            data.chargesEnabled,
            data.payoutsEnabled
          ),
          htmlBody: this.createStatusChangeEmailHtml(
            userInfo.name || "ユーザー",
            data.oldStatus,
            data.newStatus,
            data.chargesEnabled,
            data.payoutsEnabled
          ),
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
  private shouldNotifyStatusChange(
    oldStatus: import("@features/stripe-connect").StripeAccountStatusLike,
    newStatus: import("@features/stripe-connect").StripeAccountStatusLike
  ): boolean {
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

  /**
   * アカウント認証完了メール本文を作成
   */
  private createAccountVerifiedEmailBody(userName: string): string {
    return `
${userName} 様

EventPayをご利用いただき、ありがとうございます。

Stripe Connectアカウントの認証が完了しました。
これで、イベントの売上を自動的に受け取ることができるようになりました。

今後、イベント終了後に自動的に売上が送金されます。
送金状況はダッシュボードからご確認いただけます。

ご不明な点がございましたら、お気軽にお問い合わせください。

EventPay チーム
    `.trim();
  }

  /**
   * アカウント認証完了メールHTML本文を作成
   */
  private createAccountVerifiedEmailHtml(userName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>アカウント認証完了</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2563eb;">アカウント認証完了</h2>

    <p>${userName} 様</p>

    <p>EventPayをご利用いただき、ありがとうございます。</p>

    <div style="background-color: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #0ea5e9;">✅ Stripe Connectアカウントの認証が完了しました</p>
    </div>

    <p>これで、イベントの売上を自動的に受け取ることができるようになりました。</p>

    <ul>
      <li>イベント終了後に自動的に売上が送金されます</li>
      <li>送金状況はダッシュボードからご確認いただけます</li>
    </ul>

    <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #6b7280; font-size: 14px;">EventPay チーム</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * アカウント制限メール本文を作成
   */
  private createAccountRestrictedEmailBody(
    userName: string,
    restrictionReason?: string,
    requiredActions?: string[],
    dashboardUrl?: string
  ): string {
    let body = `
${userName} 様

EventPayをご利用いただき、ありがとうございます。

Stripe Connectアカウントに制限が設定されました。
    `;

    if (restrictionReason) {
      body += `\n制限理由: ${restrictionReason}\n`;
    }

    if (requiredActions && requiredActions.length > 0) {
      body += "\n必要なアクション:\n";
      requiredActions.forEach((action) => {
        body += `- ${action}\n`;
      });
    }

    if (dashboardUrl) {
      body += `\nStripeダッシュボードで詳細をご確認ください: ${dashboardUrl}\n`;
    }

    body += `
制限を解除するには、上記のアクションを完了してください。
ご不明な点がございましたら、お気軽にお問い合わせください。

EventPay チーム
    `;

    return body.trim();
  }

  /**
   * アカウント制限メールHTML本文を作成
   */
  private createAccountRestrictedEmailHtml(
    userName: string,
    restrictionReason?: string,
    requiredActions?: string[],
    dashboardUrl?: string
  ): string {
    let actionsHtml = "";
    if (requiredActions && requiredActions.length > 0) {
      actionsHtml = "<h3>必要なアクション:</h3><ul>";
      requiredActions.forEach((action) => {
        actionsHtml += `<li>${action}</li>`;
      });
      actionsHtml += "</ul>";
    }

    let dashboardHtml = "";
    if (dashboardUrl) {
      dashboardHtml = `
        <div style="margin: 20px 0;">
          <a href="${dashboardUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Stripeダッシュボードを開く
          </a>
        </div>
      `;
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>アカウント制限通知</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #dc2626;">アカウント制限通知</h2>

    <p>${userName} 様</p>

    <p>EventPayをご利用いただき、ありがとうございます。</p>

    <div style="background-color: #fef2f2; border: 1px solid #f87171; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #dc2626;">⚠️ Stripe Connectアカウントに制限が設定されました</p>
      ${restrictionReason ? `<p style="margin: 10px 0 0 0;">制限理由: ${restrictionReason}</p>` : ""}
    </div>

    ${actionsHtml}

    ${dashboardHtml}

    <p>制限を解除するには、上記のアクションを完了してください。</p>
    <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #6b7280; font-size: 14px;">EventPay チーム</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * 状態変更メール本文を作成
   */
  private createStatusChangeEmailBody(
    userName: string,
    oldStatus: string,
    newStatus: string,
    chargesEnabled: boolean,
    payoutsEnabled: boolean
  ): string {
    const statusMap: Record<string, string> = {
      unverified: "未認証",
      onboarding: "認証中",
      verified: "認証済み",
      restricted: "制限中",
    };

    return `
${userName} 様

EventPayをご利用いただき、ありがとうございます。

Stripe Connectアカウントの状態が更新されました。

変更内容:
- 状態: ${statusMap[oldStatus] || oldStatus} → ${statusMap[newStatus] || newStatus}
- 決済受取: ${chargesEnabled ? "有効" : "無効"}
- 送金: ${payoutsEnabled ? "有効" : "無効"}

${newStatus === "verified" ? "これで、イベントの売上を自動的に受け取ることができるようになりました。" : ""}

ご不明な点がございましたら、お気軽にお問い合わせください。

EventPay チーム
    `.trim();
  }

  /**
   * 状態変更メールHTML本文を作成
   */
  private createStatusChangeEmailHtml(
    userName: string,
    oldStatus: string,
    newStatus: string,
    chargesEnabled: boolean,
    payoutsEnabled: boolean
  ): string {
    const statusMap: Record<string, string> = {
      unverified: "未認証",
      onboarding: "認証中",
      verified: "認証済み",
      restricted: "制限中",
    };

    const statusColor =
      newStatus === "verified" ? "#059669" : newStatus === "restricted" ? "#dc2626" : "#2563eb";

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>アカウント状態更新</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: ${statusColor};">アカウント状態更新</h2>

    <p>${userName} 様</p>

    <p>EventPayをご利用いただき、ありがとうございます。</p>

    <div style="background-color: #f9fafb; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin-top: 0;">変更内容:</h3>
      <ul style="margin: 0;">
        <li>状態: ${statusMap[oldStatus] || oldStatus} → <strong style="color: ${statusColor};">${statusMap[newStatus] || newStatus}</strong></li>
        <li>決済受取: ${chargesEnabled ? '<span style="color: #059669;">有効</span>' : '<span style="color: #dc2626;">無効</span>'}</li>
        <li>送金: ${payoutsEnabled ? '<span style="color: #059669;">有効</span>' : '<span style="color: #dc2626;">無効</span>'}</li>
      </ul>
    </div>

    ${newStatus === "verified" ? '<div style="background-color: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 16px; margin: 20px 0;"><p style="margin: 0; color: #059669; font-weight: bold;">✅ これで、イベントの売上を自動的に受け取ることができるようになりました。</p></div>' : ""}

    <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #6b7280; font-size: 14px;">EventPay チーム</p>
  </div>
</body>
</html>
    `.trim();
  }
}
