import { type ActionResult, fail, ok } from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { isNextRedirectError } from "@core/utils/next";

import {
  buildRequirementsDueStatus,
  NO_ACCOUNT_STATUS,
  PENDING_REVIEW_STATUS,
  RESTRICTED_STATUS,
  UNVERIFIED_STATUS,
} from "../constants/detailed-account-status";
import { createUserStripeConnectServiceForServerAction } from "../services/factories";
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
    const supabase = await createServerActionSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    userId = user?.id;

    if (authError || !user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    // 2. StripeConnectServiceを初期化
    const stripeConnectService = await createUserStripeConnectServiceForServerAction();

    // 3. Connect Accountの確認
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (!account) {
      return ok({ status: NO_ACCOUNT_STATUS });
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
      return ok({ status: UNVERIFIED_STATUS });
    }

    if (accountInfo.status === "restricted") {
      return ok({ status: RESTRICTED_STATUS });
    }

    // 6. 要件チェック（認証済みだが追加情報が必要）
    if (hasPastDue || hasCurrentlyDue || hasEventuallyDue) {
      return ok({ status: buildRequirementsDueStatus({ hasPastDue, hasCurrentlyDue }) });
    }

    if (accountInfo.status === "onboarding" && (hasPendingVerification || hasPendingCapabilities)) {
      return ok({ status: PENDING_REVIEW_STATUS });
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
