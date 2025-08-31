import { SupabaseClientFactory } from "./factory";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createClient(): SupabaseClient<Database> {
  return SupabaseClientFactory.createServerClient("server");
}
