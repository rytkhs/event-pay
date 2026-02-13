import type { AppResult } from "@core/errors";
import type { StripeConnectWebhookMetaJson } from "@core/types/stripe-connect";

export type ConnectWebhookMeta = {
  terminal?: boolean;
  reason?: string;
  accountId?: string;
  userId?: string;
  payoutId?: string;
} & { [key: string]: StripeConnectWebhookMetaJson | undefined };

export type ConnectWebhookResult = AppResult<void, ConnectWebhookMeta>;
