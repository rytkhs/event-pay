import type { StripeAccountStatus as StripeAccountStatusEnum } from "@core/types/statuses";
import type { AppJson } from "@core/types/supabase";

import type { Database } from "@/types/database";

/**
 * Stripe Connectドメインの共有契約型
 */
export type StripeConnectAccountRow =
  Database["public"]["Tables"]["stripe_connect_accounts"]["Row"];
export type StripeConnectAccountInsert =
  Database["public"]["Tables"]["stripe_connect_accounts"]["Insert"];
export type StripeConnectAccountUpdate =
  Database["public"]["Tables"]["stripe_connect_accounts"]["Update"];

export type StripeAccountStatus = StripeAccountStatusEnum;

export type StripeConnectWebhookMetaJson = AppJson;
