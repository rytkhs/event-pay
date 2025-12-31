/**
 * Stripe Connect Port Adapter
 * Core層のポートインターフェースにStripe Connect機能を提供するアダプタ
 */

import { createClient } from "@supabase/supabase-js";

import {
  registerStripeConnectPort,
  type StripeAccountStatus,
  type StripeAccountStatusLike,
} from "@core/ports/stripe-connect";
import { getRequiredEnvVar } from "@core/utils/env-helper";
import { handleServerError } from "@core/utils/error-handler";

import { createStripeConnectServiceWithClient } from "../services";

/**
 * Stripe Connect機能のアダプタを登録
 */
export function registerStripeConnectAdapters(): void {
  if ((globalThis as any).__stripe_connect_registered) {
    return;
  }

  registerStripeConnectPort({
    async updateAccountFromWebhook(accountId: string, status: StripeAccountStatus) {
      try {
        // Supabase service role client を作成
        const supabaseClient = createClient(
          getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
          getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        );

        const service = createStripeConnectServiceWithClient(supabaseClient);
        // Convert StripeAccountStatus interface to UpdateAccountStatusParams
        await service.updateAccountStatus({
          userId: "webhook-user", // This should be derived from the accountId
          status: status.status as any,
          chargesEnabled: status.charges_enabled,
          payoutsEnabled: status.payouts_enabled,
          stripeAccountId: accountId,
        });
      } catch (error) {
        handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
          category: "stripe_connect",
          action: "adapter_updateAccountFromWebhook",
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

    async getConnectAccountByUser(userId: string) {
      try {
        const supabaseClient = createClient(
          getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
          getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
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
        const supabaseClient = createClient(
          getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
          getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
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
        const supabaseClient = createClient(
          getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
          getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
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

  (globalThis as any).__stripe_connect_registered = true;
}
