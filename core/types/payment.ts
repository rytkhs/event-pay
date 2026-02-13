import type { AppJson } from "@core/types/supabase";

import type { Database } from "@/types/database";

/**
 * Paymentドメインの共有契約型
 */
export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
export type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"];
export type PaymentDisputeInsert = Database["public"]["Tables"]["payment_disputes"]["Insert"];

export type PaymentWebhookMetaJson = AppJson;
