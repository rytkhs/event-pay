import type { Database } from "@/types/database";

/**
 * Payout Profileドメインの共有契約型
 */
export type PayoutProfileRow = Database["public"]["Tables"]["payout_profiles"]["Row"];
export type PayoutProfileInsert = Database["public"]["Tables"]["payout_profiles"]["Insert"];
export type PayoutProfileUpdate = Database["public"]["Tables"]["payout_profiles"]["Update"];
