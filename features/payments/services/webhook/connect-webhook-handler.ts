/**
 * Stripe Connect Webhook ハンドラー
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { logger } from "@core/logging/app-logger";
import { NotificationService } from "@core/notification";
import type {
  AccountStatusChangeNotification,
  AccountRestrictedNotification,
  StripeConnectNotificationData,
} from "@core/notification/types";
import {
  getStripeConnectPort,
  isStripeConnectPortRegistered,
  type StripeAccountStatusLike,
} from "@core/ports/stripe-connect";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import type { StripeAccountStatus } from "@core/types/enums";

// Removed @core/services dependency to break circular reference
// Use ports instead of direct feature import to avoid boundaries violation

import { Database } from "@/types/database";

/**
 * Connect Webhook イベントハンドラー
 */
export class ConnectWebhookHandler {
  private supabase: SupabaseClient<Database, "public">;
  private notificationService: NotificationService;

  private constructor(
    supabase: SupabaseClient<Database>,
    notificationService: NotificationService
  ) {
    this.supabase = supabase;
    this.notificationService = notificationService;
  }

  /**
   * 監査付きのWebhookハンドラーを作成
   */
  static async create(): Promise<ConnectWebhookHandler> {
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "Stripe Connect webhook processing"
    );

    // NotificationServiceも監査付きクライアントを使用
    const notificationService = new NotificationService(
      adminClient as SupabaseClient<Database, "public">
    );

    // フォールバック: StripeConnectPort が未登録ならここでアダプタ登録を行う
    if (!isStripeConnectPortRegistered()) {
      try {
        const { registerStripeConnectAdapters } = await import(
          "@features/stripe-connect/adapters/stripe-connect-port.adapter"
        );
        registerStripeConnectAdapters();
      } catch (e) {
        logger.error("Failed to register StripeConnect adapters", {
          tag: "stripeConnectAdapterRegisterError",
          error_name: e instanceof Error ? e.name : "Unknown",
          error_message: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    }

    return new ConnectWebhookHandler(adminClient as SupabaseClient<Database>, notificationService);
  }

  /**
   * account.updated イベントを処理
   */
  async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    try {
      // メタデータからユーザーIDを取得（actor_idへ統一）
      const userId = (account.metadata as Record<string, string | undefined> | undefined)?.actor_id;
      if (!userId) {
        logger.warn("Account missing actor_id in metadata", {
          tag: "accountMissingUserId",
          stripe_account_id: account.id,
        });
        return;
      }

      // 現在のアカウント状態を取得（存在しない場合でも処理継続し、挿入で追従）
      const stripeConnectPort = getStripeConnectPort();
      const currentAccount = await stripeConnectPort.getConnectAccountByUser(userId);

      // Stripeからアカウント情報を取得
      const accountInfo = await stripeConnectPort.getAccountInfo(account.id);

      // 状態変更を記録（存在しない場合は未知扱い）
      const oldStatus = currentAccount?.status ?? "unknown";
      const newStatus = accountInfo.status;

      // データベースのアカウント情報を更新
      await stripeConnectPort.updateAccountStatus({
        userId,
        status: accountInfo.status,
        chargesEnabled: accountInfo.chargesEnabled,
        payoutsEnabled: accountInfo.payoutsEnabled,
        // レコードが無い場合の追従作成に必要
        stripeAccountId: account.id,
      });

      logger.info("Account status updated", {
        tag: "accountStatusUpdated",
        user_id: userId,
        stripe_account_id: account.id,
        old_status: oldStatus,
        new_status: newStatus,
      });

      // 通知を送信
      await this.sendNotifications(userId, account.id, oldStatus, accountInfo);

      // セキュリティログを記録
      await this.logAccountUpdate(userId, account.id, oldStatus, accountInfo);
    } catch (error) {
      logger.error("Error handling account.updated event", {
        tag: "accountUpdatedHandlerError",
        stripe_account_id: account.id,
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });

      // 管理者にエラー通知を送信
      try {
        await this.notificationService.sendAccountStatusChangeNotification({
          userId:
            (account.metadata as Record<string, string | undefined> | undefined)?.actor_id ||
            "unknown",
          accountId: account.id,
          oldStatus: "unverified" as StripeAccountStatus,
          newStatus: "restricted" as StripeAccountStatus,
          chargesEnabled: false,
          payoutsEnabled: false,
        });
      } catch (notificationError) {
        logger.error("Failed to send error notification", {
          tag: "errorNotificationFailed",
          error_name: notificationError instanceof Error ? notificationError.name : "Unknown",
          error_message:
            notificationError instanceof Error
              ? notificationError.message
              : String(notificationError),
        });
      }

      throw error;
    }
  }

  /**
   * account.application.deauthorized イベントを処理
   * - 対象アカウントのplatform連携が解除されたため、DB上の状態を無効化
   * - 通知・監査ログを記録
   */
  async handleAccountApplicationDeauthorized(
    application: Stripe.Application,
    connectedAccountId?: string | null
  ): Promise<void> {
    try {
      const accountId = connectedAccountId || undefined;

      // 可能なら user_id をメタデータから逆引き（既存の保存がない場合はaccountIdのみで処理）
      let userId: string | undefined;
      if (accountId) {
        try {
          const stripeConnectPort = getStripeConnectPort();
          const _acc = await stripeConnectPort.getAccountInfo(accountId);
          // getAccountInfoはmetadata.actor_idまでは返さないため、DBから逆引き
          const { data } = await this.supabase
            .from("stripe_connect_accounts")
            .select("user_id")
            .eq("stripe_account_id", accountId)
            .maybeSingle();
          userId = (data as { user_id?: string } | null)?.user_id;
        } catch {
          /* noop: best-effort */
        }
      }

      if (userId) {
        // ステータスとフラグをリセット（連携解除）
        const stripeConnectPort = getStripeConnectPort();
        await stripeConnectPort.updateAccountStatus({
          userId,
          status: "unverified",
          chargesEnabled: false,
          payoutsEnabled: false,
          stripeAccountId: accountId,
        });
      }

      // 通知（存在する場合）
      if (userId) {
        await this.notificationService.sendAccountStatusChangeNotification({
          userId,
          accountId: accountId || "unknown",
          oldStatus: "verified" as StripeAccountStatus,
          newStatus: "unverified" as StripeAccountStatus,
          chargesEnabled: false,
          payoutsEnabled: false,
        });
      }

      logger.info("Processed account.application.deauthorized", {
        tag: "accountDeauthorized",
        account_id: accountId,
        user_id: userId,
        application_id: application.id,
      });
    } catch (error) {
      logger.error("Error handling account.application.deauthorized", {
        tag: "accountDeauthorizedHandlerError",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async handlePayoutPaid(payout: Stripe.Payout): Promise<void> {
    try {
      // 参考表示向けのログのみ（会計確定は行わない）
      logger.info("Payout paid received", {
        tag: "payoutPaid",
        payout_id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
      });
    } catch (error) {
      logger.error("Error handling payout.paid event", {
        tag: "payoutPaidHandlerError",
        payout_id: payout.id,
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async handlePayoutFailed(payout: Stripe.Payout): Promise<void> {
    try {
      // 参考表示向けのログのみ（会計確定は行わない）
      logger.warn("Payout failed received", {
        tag: "payoutFailed",
        payout_id: payout.id,
        failure_message: (payout as any).failure_message,
      });
    } catch (error) {
      logger.error("Error handling payout.failed event", {
        tag: "payoutFailedHandlerError",
        payout_id: payout.id,
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
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
        accountId,
      };

      // アカウント認証完了の通知
      if (
        oldStatus !== "verified" &&
        accountInfo.status === "verified" &&
        accountInfo.payoutsEnabled
      ) {
        await this.notificationService.sendAccountVerifiedNotification(baseNotificationData);
        logger.info("Account verified notification sent", {
          tag: "accountVerifiedNotificationSent",
          user_id: userId,
          stripe_account_id: baseNotificationData.accountId,
        });
      }

      // アカウント制限の通知
      if (accountInfo.status === "restricted") {
        const restrictedNotification: AccountRestrictedNotification = {
          ...baseNotificationData,
          restrictionReason: this.getRestrictionReason(accountInfo),
          requiredActions: this.getRequiredActions(accountInfo),
          dashboardUrl: `https://dashboard.stripe.com/connect/accounts/${accountId}`,
        };

        await this.notificationService.sendAccountRestrictedNotification(restrictedNotification);
        logger.info("Account restricted notification sent", {
          tag: "accountRestrictedNotificationSent",
          user_id: userId,
          stripe_account_id: restrictedNotification.accountId,
        });
      }

      // 状態変更の通知（重要な変更のみ）
      if (this.shouldNotifyStatusChange(oldStatus, accountInfo.status)) {
        const statusChangeNotification: AccountStatusChangeNotification = {
          ...baseNotificationData,
          oldStatus: oldStatus as StripeAccountStatus,
          newStatus: accountInfo.status as StripeAccountStatus,
          chargesEnabled: accountInfo.chargesEnabled,
          payoutsEnabled: accountInfo.payoutsEnabled,
        };

        await this.notificationService.sendAccountStatusChangeNotification(
          statusChangeNotification
        );
        logger.info("Account status change notification sent", {
          tag: "accountStatusChangeNotificationSent",
          user_id: userId,
          stripe_account_id: statusChangeNotification.accountId,
          old_status: oldStatus,
          new_status: accountInfo.status,
        });
      }
    } catch (error) {
      logger.error("Error sending notifications", {
        tag: "notificationSendError",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
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
        event_type: "stripe_connect_account_updated",
        user_id: userId,
        details: {
          accountId,
          oldStatus,
          newStatus: accountInfo.status,
          chargesEnabled: accountInfo.chargesEnabled,
          payoutsEnabled: accountInfo.payoutsEnabled,
          requirements: accountInfo.requirements,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error("Error logging account update", {
        tag: "accountUpdateLogError",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      // ログエラーは処理を停止させない
    }
  }

  /**
   * 制限理由を取得
   */
  private getRestrictionReason(accountInfo: {
    requirements?: { disabled_reason?: string };
  }): string | undefined {
    if (accountInfo.requirements?.disabled_reason) {
      const reasonMap: Record<string, string> = {
        "requirements.past_due": "必要な情報の提出期限が過ぎています",
        "requirements.pending_verification": "提出された情報の確認が必要です",
        listed: "アカウントがリストに掲載されています",
        platform_paused: "プラットフォームによって一時停止されています",
        "rejected.fraud": "不正行為の疑いがあります",
        "rejected.listed": "リストに掲載されているため拒否されました",
        "rejected.terms_of_service": "利用規約違反のため拒否されました",
        "rejected.other": "その他の理由で拒否されました",
        under_review: "審査中です",
        other: "その他の理由",
      };

      return (
        reasonMap[accountInfo.requirements.disabled_reason] ||
        accountInfo.requirements.disabled_reason
      );
    }

    return undefined;
  }

  /**
   * 必要なアクションを取得
   */
  private getRequiredActions(accountInfo: {
    requirements?: { currently_due?: string[]; past_due?: string[] };
  }): string[] {
    const actions: string[] = [];

    if (
      accountInfo.requirements?.currently_due &&
      accountInfo.requirements.currently_due.length > 0
    ) {
      actions.push("現在必要な情報を提出してください");

      // 具体的な必要項目を追加
      const dueItems = accountInfo.requirements?.currently_due ?? [];
      if (dueItems.includes("individual.id_number")) {
        actions.push("個人番号（マイナンバー）を提出してください");
      }
      if (dueItems.includes("individual.verification.document")) {
        actions.push("本人確認書類を提出してください");
      }
      if (dueItems.includes("business_profile.url")) {
        actions.push("事業のウェブサイトURLを入力してください");
      }
    }

    if (accountInfo.requirements?.past_due && accountInfo.requirements.past_due.length > 0) {
      actions.push("期限切れの情報を更新してください");
    }

    if (actions.length === 0) {
      actions.push("Stripeダッシュボードで詳細をご確認ください");
    }

    return actions;
  }

  /**
   * 状態変更の通知が必要かチェック
   */
  private shouldNotifyStatusChange(
    oldStatus: StripeAccountStatusLike,
    newStatus: StripeAccountStatusLike
  ): boolean {
    // 重要な状態変更のみ通知
    const importantTransitions = [
      { from: "unverified", to: "onboarding" },
      { from: "unverified", to: "verified" },
      { from: "onboarding", to: "verified" },
      { from: "verified", to: "restricted" },
      { from: "onboarding", to: "restricted" },
      { from: "restricted", to: "verified" },
      { from: "restricted", to: "onboarding" },
    ];

    return importantTransitions.some(
      (transition) => transition.from === oldStatus && transition.to === newStatus
    );
  }
}
