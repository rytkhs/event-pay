import type { StripeAccountStatus as StripeAccountStatusEnum } from "@core/types/statuses";
import type { AppJson } from "@core/types/supabase";

import type { Database } from "@/types/database";

/**
 * Stripe Connectドメインの共有契約型
 */
export type StripeConnectAccountRow = Database["public"]["Tables"]["payout_profiles"]["Row"];
export type StripeConnectAccountInsert = Database["public"]["Tables"]["payout_profiles"]["Insert"];
export type StripeConnectAccountUpdate = Database["public"]["Tables"]["payout_profiles"]["Update"];

export type StripeAccountStatus = StripeAccountStatusEnum;

export type StripeConnectWebhookMetaJson = AppJson;
