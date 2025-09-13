"use server";

import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";

import { createUserStripeConnectService } from "../services";

export type ConnectAccountStatusType =
  | "no_account" // アカウント未作成
  | "unverified" // アカウント作成済みだが未認証
  | "requirements_due" // 認証済みだが要件不備
  | "ready"; // 全て完了

export interface DetailedAccountStatus {
  statusType: ConnectAccountStatusType;
  title: string;
  description: string;
  actionText: string;
  actionUrl: string;
  severity: "info" | "warning" | "error";
}

/**
 * Stripe Connectアカウントの詳細状態をチェックするServer Action
 */
export async function getDetailedAccountStatusAction(): Promise<{
  success: boolean;
  status?: DetailedAccountStatus;
  error?: string;
}> {
  try {
    // 1. 認証チェック
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    // 2. StripeConnectServiceを初期化
    const stripeConnectService = createUserStripeConnectService();

    // 3. Connect Accountの確認
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (!account) {
      return {
        success: true,
        status: {
          statusType: "no_account",
          title: "決済機能を有効にしましょう",
          description:
            "オンライン決済を有効化するために、Stripe Connectアカウントの設定が必要です。設定は約3〜5分で完了します。",
          actionText: "アカウント設定を開始",
          actionUrl: "/dashboard/connect",
          severity: "info",
        },
      };
    }

    // 4. アカウント詳細情報を取得
    const accountInfo = await stripeConnectService.getAccountInfo(account.stripe_account_id);

    // 5. ステータス別の判定
    if (accountInfo.status === "unverified") {
      return {
        success: true,
        status: {
          statusType: "unverified",
          title: "アカウント認証を完了してください",
          description:
            "Stripe Connectアカウントの認証が完了していません。認証を完了することで決済を受け取れるようになります。",
          actionText: "認証を完了する",
          actionUrl: "/dashboard/connect?action=complete",
          severity: "warning",
        },
      };
    }

    // 6. 要件チェック（認証済みだが追加情報が必要）
    const hasRequirements =
      accountInfo.requirements &&
      (accountInfo.requirements.currently_due.length > 0 ||
        accountInfo.requirements.past_due.length > 0 ||
        accountInfo.requirements.eventually_due.length > 0);

    if (hasRequirements) {
      const hasPastDue = (accountInfo.requirements?.past_due.length || 0) > 0;
      const hasCurrentlyDue = (accountInfo.requirements?.currently_due.length || 0) > 0;

      return {
        success: true,
        status: {
          statusType: "requirements_due",
          title: hasPastDue
            ? "⚠️ 至急：アカウント情報の更新が必要です"
            : "アカウント情報の更新をお願いします",
          description: hasPastDue
            ? "期限を過ぎた必要書類があります。決済機能が制限される場合があります。"
            : hasCurrentlyDue
              ? "決済を継続するために追加の情報提供が必要です。"
              : "将来的に必要となる情報があります。早めの対応をお勧めします。",
          actionText: "情報を更新する",
          actionUrl: "/dashboard/connect?action=update",
          severity: hasPastDue ? "error" : hasCurrentlyDue ? "warning" : "info",
        },
      };
    }

    // 7. 全て正常（CTAを表示しない）
    return {
      success: true,
      status: undefined, // CTAを表示しない
    };
  } catch (error) {
    logger.error("Failed to check detailed account status", {
      tag: "detailedAccountStatusCheckError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: "アカウント状態の確認に失敗しました",
    };
  }
}
