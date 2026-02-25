/**
 * Stripe Connect Webhook ハンドラー
 *
 * account.updated Webhookを受信したとき、Account Objectを取得してClassification Algorithmを実行する
 * capabilities.* の status または requirements が変化したとき、Status Synchronizationを実行する
 * payouts_enabled または charges_enabled が変化したとき、Status Synchronizationを実行する
 */

import Stripe from "stripe";

import { errFrom, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { NotificationService } from "@core/notification/service";
import type {
  AccountStatusChangeNotification,
  AccountRestrictedNotification,
  StripeConnectNotificationData,
} from "@core/notification/types";
import { getStripeConnectPort, type StripeAccountStatusLike } from "@core/ports/stripe-connect";
import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import type { StripeAccountStatus } from "@core/types/statuses";
import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";

import type { ConnectWebhookResult } from "./connect-webhook.types";

/**
 * Connect Webhook イベントハンドラー
 */
export class ConnectWebhookHandler {
  private supabase: AppSupabaseClient<"public">;
  private notificationService: NotificationService;

  private constructor(supabase: AppSupabaseClient, notificationService: NotificationService) {
    this.supabase = supabase;
    this.notificationService = notificationService;
  }

  /**
   * 構造化ロガー
   */
  private get logger() {
    return logger.withContext({
      category: "stripe_webhook",
      action: "connect_webhook_handler",
      actor_type: "webhook",
    });
  }

  /**
   * 監査付きのWebhookハンドラーを作成
   */
  static async create(): Promise<ConnectWebhookHandler> {
    const adminClient = await createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "Stripe Connect webhook processing"
    );

    // NotificationServiceも監査付きクライアントを使用
    const notificationService = new NotificationService(adminClient as AppSupabaseClient<"public">);

    return new ConnectWebhookHandler(adminClient as AppSupabaseClient, notificationService);
  }

  /**
   * account.updated イベントを処理
   *
   * Account Objectを取得してClassification Algorithmを実行する
   * capabilities.* の status または requirements が変化したとき、Status Synchronizationを実行する
   * payouts_enabled または charges_enabled が変化したとき、Status Synchronizationを実行する
   */
  async handleAccountUpdated(account: Stripe.Account): Promise<ConnectWebhookResult> {
    try {
      // メタデータからユーザーIDを取得（actor_idへ統一）
      const userId = (account.metadata as Record<string, string | undefined> | undefined)?.actor_id;
      if (!userId) {
        this.logger.warn("Account missing actor_id in metadata", {
          stripe_account_id: account.id,
          outcome: "failure",
        });
        return okResult(undefined, {
          reason: "missing_actor_id",
          accountId: account.id,
        });
      }

      // 現在のアカウント状態を取得（存在しない場合でも処理継続し、挿入で追従）
      const stripeConnectPort = getStripeConnectPort();
      const currentAccount = await stripeConnectPort.getConnectAccountByUser(userId);

      // AccountStatusClassifierを使用してステータスを分類
      const { AccountStatusClassifier } = await import("../account-status-classifier");
      const classifier = new AccountStatusClassifier();
      const classificationResult = classifier.classify(account);

      // 状態変更を記録（存在しない場合は未知扱い）
      const oldStatus = currentAccount?.status ?? "unknown";
      const newStatus = classificationResult.status;

      // データベースのアカウント情報を更新（classificationMetadataとtriggerを含む）
      await stripeConnectPort.updateAccountStatus({
        userId,
        status: classificationResult.status,
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
        // レコードが無い場合の追従作成に必要
        stripeAccountId: account.id,
        classificationMetadata: classificationResult.metadata,
        trigger: "webhook",
      });

      this.logger.info("Account status updated via webhook", {
        user_id: userId,
        stripe_account_id: account.id,
        old_status: oldStatus,
        new_status: newStatus,
        classification_gate: classificationResult.metadata.gate,
        classification_reason: classificationResult.reason,
        outcome: "success",
      });

      // 通知を送信
      await this.sendNotifications(userId, account.id, oldStatus, {
        status: classificationResult.status,
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
        requirements: account.requirements
          ? {
              disabled_reason: account.requirements.disabled_reason
                ? String(account.requirements.disabled_reason)
                : undefined,
              currently_due: account.requirements.currently_due ?? undefined,
              past_due: account.requirements.past_due ?? undefined,
            }
          : undefined,
      });

      // セキュリティログを記録
      await this.logAccountUpdate(userId, account.id, oldStatus, {
        status: classificationResult.status,
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
        requirements: account.requirements
          ? {
              disabled_reason: account.requirements.disabled_reason
                ? String(account.requirements.disabled_reason)
                : undefined,
              currently_due: account.requirements.currently_due ?? undefined,
              past_due: account.requirements.past_due ?? undefined,
            }
          : undefined,
      });

      return okResult(undefined, {
        reason: "account_updated_processed",
        accountId: account.id,
        userId,
      });
    } catch (error) {
      handleServerError("CONNECT_WEBHOOK_ACCOUNT_UPDATED_ERROR", {
        action: "handleAccountUpdated",
        additionalData: {
          category: "stripe_webhook",
          stripe_account_id: account.id,
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
        },
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
        handleServerError("CONNECT_WEBHOOK_NOTIFICATION_ERROR", {
          action: "sendErrorNotification",
          additionalData: {
            category: "stripe_webhook",
            error_name: notificationError instanceof Error ? notificationError.name : "Unknown",
            error_message:
              notificationError instanceof Error
                ? notificationError.message
                : String(notificationError),
          },
        });
      }

      return errFrom(error, {
        defaultCode: "CONNECT_WEBHOOK_ACCOUNT_UPDATED_ERROR",
        meta: {
          reason: "account_updated_failed",
          accountId: account.id,
          userId: (account.metadata as Record<string, string | undefined> | undefined)?.actor_id,
        },
      });
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
  ): Promise<ConnectWebhookResult> {
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

      this.logger.info("Processed account.application.deauthorized", {
        account_id: accountId,
        user_id: userId,
        application_id: application.id,
        outcome: "success",
      });

      return okResult(undefined, {
        reason: userId ? "account_deauthorized_processed" : "account_deauthorized_without_user",
        accountId,
        userId,
      });
    } catch (error) {
      handleServerError("CONNECT_WEBHOOK_DEAUTHORIZED_ERROR", {
        action: "handleAccountApplicationDeauthorized",
        additionalData: {
          category: "stripe_webhook",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
        },
      });
      return errFrom(error, {
        defaultCode: "CONNECT_WEBHOOK_DEAUTHORIZED_ERROR",
        meta: {
          reason: "account_deauthorized_failed",
          accountId: connectedAccountId ?? undefined,
        },
      });
    }
  }

  async handlePayoutPaid(payout: Stripe.Payout): Promise<ConnectWebhookResult> {
    try {
      // 参考表示向けのログのみ（会計確定は行わない）
      this.logger.info("Payout paid received", {
        payout_id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        outcome: "success",
      });
      return okResult(undefined, {
        reason: "payout_paid_processed",
        payoutId: payout.id,
      });
    } catch (error) {
      handleServerError("CONNECT_WEBHOOK_PAYOUT_ERROR", {
        action: "handlePayoutPaid",
        additionalData: {
          category: "stripe_webhook",
          payout_id: payout.id,
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
        },
      });
      return errFrom(error, {
        defaultCode: "CONNECT_WEBHOOK_PAYOUT_ERROR",
        meta: {
          reason: "payout_paid_failed",
          payoutId: payout.id,
        },
      });
    }
  }

  async handlePayoutFailed(payout: Stripe.Payout): Promise<ConnectWebhookResult> {
    try {
      // 参考表示向けのログのみ（会計確定は行わない）
      this.logger.warn("Payout failed received", {
        payout_id: payout.id,
        failure_message: payout.failure_message,
        outcome: "failure",
      });
      return okResult(undefined, {
        reason: "payout_failed_processed",
        payoutId: payout.id,
      });
    } catch (error) {
      handleServerError("CONNECT_WEBHOOK_PAYOUT_ERROR", {
        action: "handlePayoutFailed",
        additionalData: {
          category: "stripe_webhook",
          payout_id: payout.id,
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
        },
      });
      return errFrom(error, {
        defaultCode: "CONNECT_WEBHOOK_PAYOUT_ERROR",
        meta: {
          reason: "payout_failed_handler_error",
          payoutId: payout.id,
        },
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
      if (oldStatus !== "verified" && accountInfo.status === "verified") {
        await this.notificationService.sendAccountVerifiedNotification(baseNotificationData);
        this.logger.info("Account verified notification sent", {
          user_id: userId,
          stripe_account_id: baseNotificationData.accountId,
          outcome: "success",
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
        this.logger.info("Account restricted notification sent", {
          user_id: userId,
          stripe_account_id: restrictedNotification.accountId,
          outcome: "success",
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
        this.logger.info("Account status change notification sent", {
          user_id: userId,
          stripe_account_id: statusChangeNotification.accountId,
          old_status: oldStatus,
          new_status: accountInfo.status,
          outcome: "success",
        });
      }
    } catch (error) {
      handleServerError("CONNECT_WEBHOOK_NOTIFICATION_ERROR", {
        action: "sendNotifications",
        additionalData: {
          category: "stripe_webhook",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
        },
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
      const { logStripeConnect } = await import("@core/logging/system-logger");

      await logStripeConnect({
        action: "stripe_connect_account_updated",
        message: `Stripe Connect account status updated from ${oldStatus} to ${accountInfo.status}`,
        user_id: userId,
        outcome: "success",
        metadata: {
          accountId,
          oldStatus,
          newStatus: accountInfo.status,
          chargesEnabled: accountInfo.chargesEnabled,
          payoutsEnabled: accountInfo.payoutsEnabled,
          requirements: accountInfo.requirements,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      handleServerError("AUDIT_LOG_RECORDING_FAILED", {
        action: "logAccountUpdate",
        additionalData: {
          category: "stripe_webhook",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
        },
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
