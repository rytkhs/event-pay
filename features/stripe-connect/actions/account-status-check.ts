import { type ActionResult, fail, ok } from "@core/errors/adapters/server-actions";
import { createClient } from "@core/supabase/server";
import { handleServerError } from "@core/utils/error-handler.server";
import { isNextRedirectError } from "@core/utils/next";

import { createUserStripeConnectService } from "../services/factories";
import type { DetailedAccountStatusPayload } from "../types";

/**
 * Stripe Connectアカウントの詳細状態をチェックするServer Action
 */
export async function getDetailedAccountStatusAction(): Promise<
  ActionResult<DetailedAccountStatusPayload>
> {
  let userId: string | undefined;
  try {
    // 1. 認証チェック
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    userId = user?.id;

    if (authError || !user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    // 2. StripeConnectServiceを初期化
    const stripeConnectService = createUserStripeConnectService();

    // 3. Connect Accountの確認
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (!account) {
      return ok({
        status: {
          statusType: "no_account",
          title: "決済機能を有効にしましょう",
          description:
            "オンライン決済を有効化するために、Stripeアカウントの設定が必要です。設定は約3〜5分で完了します。",
          actionText: "アカウント設定を開始",
          actionUrl: "/dashboard/connect",
          severity: "info",
        },
      });
    }

    // 4. アカウント詳細情報を取得
    const accountInfo = await stripeConnectService.getAccountInfo(account.stripe_account_id);

    const requirements = accountInfo.requirements ?? {
      currently_due: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    };

    const hasPastDue = (requirements.past_due?.length ?? 0) > 0;
    const hasCurrentlyDue = (requirements.currently_due?.length ?? 0) > 0;
    const hasEventuallyDue = (requirements.eventually_due?.length ?? 0) > 0;
    const hasPendingVerification = (requirements.pending_verification?.length ?? 0) > 0;
    const hasPendingCapabilities = Boolean(
      accountInfo.capabilities &&
        (accountInfo.capabilities.card_payments === "pending" ||
          accountInfo.capabilities.transfers === "pending")
    );

    // 5. ステータス別の判定
    if (accountInfo.status === "unverified") {
      return ok({
        status: {
          statusType: "unverified",
          title: "アカウント認証を完了してください",
          description:
            "Stripeアカウントの認証が完了していません。認証を完了することで決済を受け取れるようになります。",
          actionText: "認証を完了する",
          actionUrl: "/dashboard/connect?action=complete",
          severity: "warning",
        },
      });
    }

    // 6. 要件チェック（認証済みだが追加情報が必要）
    if (hasPastDue || hasCurrentlyDue || hasEventuallyDue) {
      return ok({
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
      });
    }

    if (accountInfo.status === "onboarding" && (hasPendingVerification || hasPendingCapabilities)) {
      return ok({
        status: {
          statusType: "pending_review",
          title: "Stripeが審査中です",
          description:
            "提出いただいた情報をStripeが確認しています。審査完了までしばらくお待ちください。",
          actionText: "提出内容を確認",
          actionUrl: "/settings/payments",
          severity: "info",
        },
      });
    }

    // 7. 全て正常（CTAを表示しない）
    /**
     * 決済可能状態（ready）の場合は意図的に status を undefined で返却
     * 理由:
     * - UI側でCTAを非表示にするため
     * - 判定側では !status の条件で「ready」状態を検出する
     * - statusType: "ready" を明示的に返すと、CTAコンポーネントが表示されてしまう
     */
    return ok({
      status: undefined, // ready状態 = CTA非表示
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    handleServerError(error, {
      category: "stripe_connect",
      action: "get_detailed_account_status_failed",
      userId,
    });

    return fail("INTERNAL_ERROR", {
      userMessage: "アカウント状態の確認に失敗しました",
    });
  }
}
