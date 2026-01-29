import "server-only";

import type { Stripe } from "stripe";

import type { PaymentLogger } from "@core/logging/payment-logger";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import { handleServerError } from "@core/utils/error-handler.server";

/**
 * Connect Account の事前検証を行う
 * @param accountId Stripe Connect Account ID
 * @param stripe Stripe Client
 * @param logger Payment Logger
 * @throws PaymentError Connect Account に問題がある場合
 */
export async function validateConnectAccount(
  accountId: string,
  stripe: Stripe,
  logger: PaymentLogger
): Promise<void> {
  try {
    // Stripe APIでConnect Account情報を取得
    const account = await stripe.accounts.retrieve(accountId);

    // 1. アカウントが制限されていないかチェック
    if (account.requirements?.disabled_reason) {
      logger.warn("Connect Account is restricted", {
        connect_account_id: accountId,
        disabled_reason: account.requirements.disabled_reason,
        outcome: "failure",
      });
      throw new PaymentError(
        PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
        `Connect Account is restricted: ${account.requirements.disabled_reason}`,
        { accountId, disabledReason: account.requirements.disabled_reason }
      );
    }

    // 2. payouts_enabled がtrueかチェック
    if (!account.payouts_enabled) {
      logger.warn("Connect Account payouts not enabled", {
        connect_account_id: accountId,
        payouts_enabled: account.payouts_enabled,
        outcome: "failure",
      });
      throw new PaymentError(
        PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
        "Connect Account payouts are not enabled",
        { accountId, payoutsEnabled: account.payouts_enabled }
      );
    }

    // 3. transfers capability がactiveかチェック
    const transfersCap = account.capabilities?.transfers;
    const isTransfersActive = (() => {
      if (transfersCap === "active") return true;
      if (typeof transfersCap === "object" && transfersCap && "status" in transfersCap) {
        return (transfersCap as any).status === "active";
      }
      return false;
    })();

    if (!isTransfersActive) {
      logger.warn("Connect Account transfers capability not active", {
        connect_account_id: accountId,
        transfers_capability: transfersCap,
        outcome: "failure",
      });
      throw new PaymentError(
        PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
        "Connect Account transfers capability is not active",
        { accountId, transfersCapability: transfersCap }
      );
    }

    logger.info("Connect Account validation passed", {
      connect_account_id: accountId,
      payouts_enabled: account.payouts_enabled,
      transfers_capability: transfersCap,
      outcome: "success",
    });
  } catch (error) {
    // PaymentErrorはそのまま再スロー
    if (error instanceof PaymentError) {
      throw error;
    }

    // Stripe APIエラーの場合
    if (error && typeof error === "object" && "type" in error) {
      const stripeError = error as { message?: string; type?: string };

      // "No such account" エラーは CONNECT_ACCOUNT_NOT_FOUND として分類
      if (
        stripeError.message?.includes("No such account") ||
        stripeError.message?.includes("does not exist")
      ) {
        handleServerError("STRIPE_CONNECT_ACCOUNT_NOT_FOUND", {
          category: "payment",
          action: "validate_connect_account",
          additionalData: {
            connect_account_id: accountId,
            error_message: stripeError.message,
          },
        });
        throw new PaymentError(
          PaymentErrorType.CONNECT_ACCOUNT_NOT_FOUND,
          `Connect Account not found: ${accountId}`,
          error
        );
      }

      // その他のStripe APIエラー
      handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
        category: "payment",
        action: "validate_connect_account_stripe_error",
        additionalData: {
          connect_account_id: accountId,
          error_type: stripeError.type,
          error_message: stripeError.message,
        },
      });
      throw new PaymentError(
        PaymentErrorType.STRIPE_CONFIG_ERROR,
        `Connect Account validation failed: ${stripeError.message}`,
        error
      );
    }

    // その他の予期しないエラー
    handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
      category: "payment",
      action: "validate_connect_account_unexpected_error",
      additionalData: {
        connect_account_id: accountId,
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    throw new PaymentError(
      PaymentErrorType.STRIPE_CONFIG_ERROR,
      "Connect Account validation failed due to unexpected error",
      error as Error
    );
  }
}
