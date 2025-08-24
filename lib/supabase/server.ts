import { SupabaseClientFactory } from "./factory";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createSupabaseServerClient(): SupabaseClient<Database> {
  return SupabaseClientFactory.createServerClient("server");
}

// createClient エイリアスを追加
export const createClient = createSupabaseServerClient;
