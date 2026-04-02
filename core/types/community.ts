import type { Database } from "@/types/database";

/**
 * Communityドメインの共有契約型
 */

export type CommunityRow = Database["public"]["Tables"]["communities"]["Row"];
export type CommunityInsert = Database["public"]["Tables"]["communities"]["Insert"];
export type CommunityUpdate = Database["public"]["Tables"]["communities"]["Update"];
