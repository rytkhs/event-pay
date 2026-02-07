/**
 * Stripe Connect Port Adapter
 * Core層のポートインターフェースにStripe Connect機能を提供するアダプタ
 */

import {
  registerStripeConnectPort,
  type StripeAccountStatusLike,
} from "@core/ports/stripe-connect";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { handleServerError } from "@core/utils/error-handler.server";

import { createStripeConnectServiceWithClient } from "../services/factories";

/**
 * Stripe Connect機能のアダプタを登録
 */
export function registerStripeConnectAdapters(): void {
  registerStripeConnectPort({
    async getConnectAccountByUser(userId: string) {
      try {
        const factory = SecureSupabaseClientFactory.create();
        const supabaseClient = await factory.createAuditedAdminClient(
          AdminReason.PAYMENT_PROCESSING,
          `features/stripe-connect/adapters/stripe-connect-port.adapter getConnectAccountByUser userId=${userId}`,
          { userId }
        );

        const service = createStripeConnectServiceWithClient(supabaseClient);
        const account = await service.getConnectAccountByUser(userId);
        return account ? { status: account.status as StripeAccountStatusLike } : null;
      } catch (error) {
        handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
          category: "stripe_connect",
          action: "adapter_getConnectAccountByUser",
          actorType: "system",
          additionalData: {
            user_id: userId,
            error_name: error instanceof Error ? error.name : "Unknown",
            error_message: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },

    async getAccountInfo(accountId: string) {
      try {
        const factory = SecureSupabaseClientFactory.create();
        const supabaseClient = await factory.createAuditedAdminClient(
          AdminReason.PAYMENT_PROCESSING,
          `features/stripe-connect/adapters/stripe-connect-port.adapter getAccountInfo accountId=${accountId}`
        );

        const service = createStripeConnectServiceWithClient(supabaseClient);
        const accountInfo = await service.getAccountInfo(accountId);
        return {
          status: accountInfo.status as StripeAccountStatusLike,
          chargesEnabled: accountInfo.chargesEnabled,
          payoutsEnabled: accountInfo.payoutsEnabled,
          requirements: accountInfo.requirements
            ? {
                disabled_reason: accountInfo.requirements.disabled_reason,
                currently_due: accountInfo.requirements.currently_due,
                past_due: accountInfo.requirements.past_due,
              }
            : undefined,
          classificationMetadata: accountInfo.classificationMetadata,
        };
      } catch (error) {
        handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
          category: "stripe_connect",
          action: "adapter_getAccountInfo",
          actorType: "system",
          additionalData: {
            account_id: accountId,
            error_name: error instanceof Error ? error.name : "Unknown",
            error_message: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },

    async updateAccountStatus(input) {
      try {
        const factory = SecureSupabaseClientFactory.create();
        const supabaseClient = await factory.createAuditedAdminClient(
          AdminReason.PAYMENT_PROCESSING,
          `features/stripe-connect/adapters/stripe-connect-port.adapter updateAccountStatus userId=${input.userId}`,
          {
            userId: input.userId,
            additionalInfo: { stripeAccountId: input.stripeAccountId },
          }
        );

        const service = createStripeConnectServiceWithClient(supabaseClient);
        await service.updateAccountStatus({
          userId: input.userId,
          status: input.status as any, // 型キャストが必要な場合
          chargesEnabled: input.chargesEnabled,
          payoutsEnabled: input.payoutsEnabled,
          stripeAccountId: input.stripeAccountId,
          classificationMetadata: input.classificationMetadata,
          trigger: input.trigger,
        });
      } catch (error) {
        handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
          category: "stripe_connect",
          action: "adapter_updateAccountStatus",
          actorType: "system",
          additionalData: {
            user_id: input.userId,
            stripe_account_id: input.stripeAccountId,
            error_name: error instanceof Error ? error.name : "Unknown",
            error_message: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },
  });
}
